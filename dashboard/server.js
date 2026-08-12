import express from "express";
import { execFile } from "child_process";

const app = express();
const PORT = 4000;
const SSH_HOST = "damaasta@ssh.kistle.uk";

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    execFile("ssh", ["-o", "ConnectTimeout=10", SSH_HOST, cmd], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function dbQuery(sql) {
  const escaped = sql.replace(/'/g, "'\\''");
  return ssh(`docker exec postgres psql -U admin -d webapp -t -A -F '|' -c '${escaped}'`);
}

function parseRows(raw, columns) {
  if (!raw.trim()) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const parts = line.split("|");
    const obj = {};
    columns.forEach((col, i) => (obj[col] = parts[i] ?? ""));
    return obj;
  });
}

app.get("/api/stats", async (_req, res) => {
  try {
    const [userCount, groupCount, boxTypes, productCount, bookingCount, recentBookingsRaw, usersRaw] =
      await Promise.all([
        dbQuery("SELECT COUNT(*) FROM users"),
        dbQuery("SELECT COUNT(*) FROM spaces WHERE is_group = true"),
        dbQuery("SELECT type, COUNT(*) FROM spaces WHERE is_group = false AND parent_id IS NOT NULL GROUP BY type ORDER BY count DESC"),
        dbQuery("SELECT COUNT(*) FROM products"),
        dbQuery("SELECT COUNT(*) FROM bookings"),
        dbQuery(`
          SELECT b.id, b.user_display_name, b.user_email, b.type, b.is_returned, b.created_at,
                 COALESCE(string_agg(bi.product_name || CASE WHEN bi.quantity > 1 THEN ' x' || bi.quantity ELSE '' END, ', '), '-')
          FROM bookings b
          LEFT JOIN booking_items bi ON bi.booking_id = b.id
          GROUP BY b.id ORDER BY b.created_at DESC LIMIT 20
        `),
        dbQuery("SELECT uid, email, display_name, photo_url, created_at FROM users ORDER BY created_at DESC"),
      ]);

    const boxes = parseRows(boxTypes, ["type", "count"]).map((r) => ({ ...r, count: +r.count }));
    const recentBookings = parseRows(recentBookingsRaw, ["id", "user_display_name", "user_email", "type", "is_returned", "created_at", "items"]);
    const users = parseRows(usersRaw, ["uid", "email", "display_name", "photo_url", "created_at"]);

    res.json({
      users: { total: +userCount.trim(), list: users },
      groups: +groupCount.trim(),
      boxes,
      products: +productCount.trim(),
      bookings: { total: +bookingCount.trim(), recent: recentBookings },
    });
  } catch (e) {
    console.error("DB error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/server", async (_req, res) => {
  try {
    const raw = await ssh([
      "echo TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0)",
      "echo DISK=$(df -h / | tail -1)",
      "echo MEM=$(free -m | grep Mem)",
      "echo UPTIME=$(uptime -p)",
      "echo CORES=$(nproc)",
      "echo LOAD=$(cat /proc/loadavg)",
      "echo DOCKER_START",
      "docker ps --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}'",
      "echo DOCKER_END",
    ].join(" && "));

    const get = (key) => {
      const m = raw.match(new RegExp(`${key}=(.*)`));
      return m ? m[1].trim() : "";
    };

    const temp = Math.round(parseInt(get("TEMP")) / 1000);
    const diskParts = get("DISK").split(/\s+/);
    const memParts = get("MEM").split(/\s+/);
    const loadParts = get("LOAD").split(/\s+/);
    const cores = parseInt(get("CORES"));

    const dockerBlock = raw.match(/DOCKER_START\n([\s\S]*?)DOCKER_END/);
    const containers = (dockerBlock ? dockerBlock[1].trim() : "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split("\t");
        return { name, status: rest[0] || "", image: rest[1] || "" };
      });

    res.json({
      temperature: temp,
      disk: { total: diskParts[1], used: diskParts[2], available: diskParts[3], percent: diskParts[4] },
      memory: { total: +memParts[1], used: +memParts[2], free: +memParts[3], available: +memParts[6] },
      uptime: get("UPTIME").replace("up ", ""),
      cpu: {
        cores,
        load1: +(loadParts[0] || "0").replace(",", "."),
        load5: +(loadParts[1] || "0").replace(",", "."),
        load15: +(loadParts[2] || "0").replace(",", "."),
      },
      containers,
    });
  } catch (e) {
    console.error("Server error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/errors", async (_req, res) => {
  try {
    const [webappLogs, nginxLogs] = await Promise.all([
      ssh("docker logs webapp --tail 200 2>&1").catch(() => ""),
      ssh("docker logs nginx --tail 200 2>&1").catch(() => ""),
    ]);

    const errors = [];

    for (const line of webappLogs.split("\n").filter(Boolean)) {
      const lower = line.toLowerCase();
      let level = null;
      if (lower.includes("error") || lower.includes("err:") || lower.includes("uncaught") || lower.includes("unhandled") || lower.includes("fatal")) level = "error";
      else if (lower.includes("warn")) level = "warn";
      else if (lower.match(/\b(4\d{2}|5\d{2})\b/) && (lower.includes("status") || lower.includes("http"))) level = lower.match(/\b5\d{2}\b/) ? "error" : "warn";
      if (level) {
        const ts = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
        errors.push({ source: "webapp", level, message: line.trim(), timestamp: ts ? ts[1] : null });
      }
    }

    for (const line of nginxLogs.split("\n").filter(Boolean)) {
      const lower = line.toLowerCase();
      let level = null;
      if (lower.includes("[error]") || lower.includes("[crit]") || lower.includes("[alert]") || lower.includes("[emerg]")) level = "error";
      else if (lower.includes("[warn]")) level = "warn";
      else if (line.match(/"\s*(4\d{2}|5\d{2})\s/)) level = line.match(/"\s*5\d{2}\s/) ? "error" : "warn";
      if (level) {
        const ts = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
        errors.push({ source: "nginx", level, message: line.trim(), timestamp: ts ? ts[1].replace(/\//g, "-") : null });
      }
    }

    let lockErrors = [];
    try {
      const raw = await dbQuery("SELECT id, error_type, error_message, user_email, created_at FROM lock_errors ORDER BY created_at DESC LIMIT 50");
      if (raw.trim()) {
        lockErrors = parseRows(raw, ["id", "error_type", "error_message", "user_email", "created_at"]).map(r => ({
          source: "lock", level: "error", message: `[${r.error_type}] ${r.error_message} (${r.user_email})`, timestamp: r.created_at
        }));
      }
    } catch { /* table may not exist */ }

    const all = [...errors, ...lockErrors]
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 200);

    res.json({ errors: all, total: all.length });
  } catch (e) {
    console.error("Errors endpoint:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/groups", async (_req, res) => {
  try {
    const [groupsRaw, boxesRaw, productCountsRaw] = await Promise.all([
      dbQuery(`SELECT id, name, description, color, icon, created_at FROM spaces WHERE is_group = true ORDER BY name`),
      dbQuery(`SELECT id, name, description, type, color, box_number, parent_id FROM spaces WHERE is_group = false AND parent_id IS NOT NULL ORDER BY box_number, name`),
      dbQuery(`SELECT space_id, COUNT(*) as cnt FROM products GROUP BY space_id`),
    ]);

    const groups = parseRows(groupsRaw, ["id", "name", "description", "color", "icon", "created_at"]);
    const allBoxes = parseRows(boxesRaw, ["id", "name", "description", "type", "color", "box_number", "parent_id"]);
    const productCounts = {};
    parseRows(productCountsRaw, ["space_id", "cnt"]).forEach((r) => { productCounts[r.space_id] = +r.cnt; });

    const result = groups.map((g) => {
      const children = allBoxes.filter((b) => b.parent_id === g.id).map((b) => ({
        ...b,
        box_number: b.box_number ? +b.box_number : null,
        productCount: productCounts[b.id] || 0,
      }));
      const totalProducts = children.reduce((s, b) => s + b.productCount, 0) + (productCounts[g.id] || 0);
      return { ...g, boxes: children, totalProducts, unboxedProducts: productCounts[g.id] || 0 };
    });

    res.json(result);
  } catch (e) {
    console.error("Groups error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/spaces/:id/products", async (req, res) => {
  try {
    const id = req.params.id.replace(/'/g, "''");
    const raw = await dbQuery(`SELECT id, name, quantity, unit, category, description, barcode, image_url, color, created_at FROM products WHERE space_id = '${id}' ORDER BY name`);
    const products = parseRows(raw, ["id", "name", "quantity", "unit", "category", "description", "barcode", "image_url", "color", "created_at"]);
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/db/:table", async (req, res) => {
  const allowed = ["users", "spaces", "space_members", "products", "bookings", "booking_items", "booking_parent_spaces", "notifications", "folders", "documents", "push_subscriptions"];
  const table = req.params.table;
  if (!allowed.includes(table)) return res.status(400).json({ error: "Table not allowed" });

  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || "";

  try {
    const colsRaw = await dbQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`);
    const columns = colsRaw.split("\n").filter(Boolean);

    let where = "";
    if (search) {
      const s = search.replace(/'/g, "''");
      const textCols = columns.slice(0, 6);
      where = "WHERE " + textCols.map(c => `CAST("${c}" AS TEXT) ILIKE '%${s}%'`).join(" OR ");
    }

    const countRaw = await dbQuery(`SELECT COUNT(*) FROM "${table}" ${where}`);
    const total = +countRaw.trim();

    const dataRaw = await dbQuery(`SELECT * FROM "${table}" ${where} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`);
    const rows = dataRaw.trim() ? dataRaw.split("\n").filter(Boolean).map(line => {
      const parts = line.split("|");
      const obj = {};
      columns.forEach((col, i) => obj[col] = parts[i] ?? "");
      return obj;
    }) : [];

    res.json({ columns, rows, total, limit, offset });
  } catch (e) {
    console.error("DB browser error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (_req, res) => {
  res.send(HTML);
});

const HTML = /*html*/ `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kistle Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
  .header { padding: 24px 32px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e2030; }
  .header h1 { font-size: 22px; font-weight: 800; color: #f1f5f9; }
  .header h1 span { color: #f59e0b; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .status-dot.ok { background: #22c55e; box-shadow: 0 0 8px #22c55e88; }
  .status-dot.err { background: #ef4444; box-shadow: 0 0 8px #ef444488; }
  .refresh-info { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; padding: 20px 32px; }
  .card { background: #181b27; border: 1px solid #252836; border-radius: 14px; padding: 18px; }
  .card-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .card-value { font-size: 28px; font-weight: 800; color: #f1f5f9; }
  .card-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .section { padding: 8px 32px 20px; }
  .section-title { font-size: 14px; font-weight: 700; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .wide-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 800px) { .wide-grid { grid-template-columns: 1fr; } }
  .panel { background: #181b27; border: 1px solid #252836; border-radius: 14px; padding: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 8px; border-bottom: 1px solid #252836; }
  td { padding: 8px; font-size: 13px; border-bottom: 1px solid #1e2030; color: #cbd5e1; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
  .badge-booking { background: #1e3a5f; color: #60a5fa; }
  .badge-return { background: #14532d; color: #4ade80; }
  .badge-returned { background: #1c1917; color: #78716c; text-decoration: line-through; }
  .container-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1e2030; }
  .container-row:last-child { border-bottom: none; }
  .container-name { font-weight: 700; font-size: 13px; min-width: 120px; }
  .container-status { font-size: 12px; color: #94a3b8; }
  .container-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .container-dot.up { background: #22c55e; }
  .container-dot.down { background: #ef4444; }
  .progress-bar { height: 8px; background: #252836; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
  .user-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #252836; }
  .temp-ok { color: #22c55e; }
  .temp-warm { color: #f59e0b; }
  .temp-hot { color: #ef4444; }
  .type-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .type-chip { padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; background: #252836; color: #cbd5e1; }

  .groups-browser { padding: 8px 32px 20px; }
  .group-card { background: #181b27; border: 1px solid #252836; border-radius: 14px; margin-bottom: 12px; overflow: hidden; }
  .group-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; cursor: pointer; user-select: none; transition: background 0.15s; }
  .group-header:hover { background: #1e2030; }
  .group-info { display: flex; align-items: center; gap: 12px; }
  .group-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .group-name { font-size: 15px; font-weight: 700; color: #f1f5f9; }
  .group-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
  .group-meta { display: flex; gap: 12px; align-items: center; }
  .group-stat { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 4px; }
  .group-stat strong { color: #f1f5f9; font-weight: 700; }
  .group-chevron { color: #64748b; transition: transform 0.25s; font-size: 18px; }
  .group-chevron.open { transform: rotate(90deg); }
  .group-body { display: none; border-top: 1px solid #252836; }
  .group-body.open { display: block; }
  .box-list { padding: 12px 18px; }
  .box-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; cursor: pointer; transition: background 0.15s; margin-bottom: 4px; }
  .box-row:hover { background: #252836; }
  .box-color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .box-info { flex: 1; }
  .box-label { font-size: 13px; font-weight: 700; color: #e2e8f0; }
  .box-sublabel { font-size: 11px; color: #64748b; }
  .box-count { font-size: 12px; font-weight: 700; color: #94a3b8; background: #252836; padding: 2px 8px; border-radius: 6px; }
  .box-type-badge { font-size: 10px; font-weight: 700; color: #f59e0b; background: #2a2520; padding: 2px 7px; border-radius: 5px; text-transform: uppercase; }
  .products-panel { background: #12141e; border-top: 1px solid #252836; padding: 14px 18px; display: none; }
  .products-panel.open { display: block; }
  .product-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #1e2030; }
  .product-row:last-child { border-bottom: none; }
  .product-color { width: 6px; height: 28px; border-radius: 3px; flex-shrink: 0; }
  .product-name { font-size: 13px; font-weight: 600; color: #e2e8f0; flex: 1; }
  .product-qty { font-size: 13px; font-weight: 700; color: #f1f5f9; }
  .product-unit { font-size: 11px; color: #64748b; margin-left: 2px; }
  .product-cat { font-size: 10px; color: #94a3b8; background: #1e2030; padding: 2px 6px; border-radius: 4px; }
  .product-desc { font-size: 11px; color: #64748b; }
  .empty-products { padding: 16px; text-align: center; font-size: 13px; color: #64748b; }
  .unboxed-row { padding: 10px 14px; border-radius: 10px; cursor: pointer; transition: background 0.15s; margin-bottom: 4px; display: flex; align-items: center; gap: 12px; opacity: 0.7; }
  .unboxed-row:hover { background: #252836; }

  .error-browser { padding: 8px 32px 20px; }
  .error-panel { background: #181b27; border: 1px solid #252836; border-radius: 14px; overflow: hidden; }
  .error-toolbar { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid #252836; flex-wrap: wrap; }
  .error-filter { padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; background: #252836; color: #94a3b8; border: 1px solid #252836; cursor: pointer; transition: all 0.15s; }
  .error-filter:hover { background: #1e2030; color: #e2e8f0; }
  .error-filter.active { background: #f59e0b; color: #0f1117; border-color: #f59e0b; }
  .error-search { flex: 1; min-width: 150px; padding: 6px 12px; border-radius: 8px; border: 1px solid #252836; background: #12141e; color: #e2e8f0; font-size: 12px; outline: none; }
  .error-search:focus { border-color: #f59e0b; }
  .error-search::placeholder { color: #4a5568; }
  .error-count { font-size: 11px; color: #64748b; padding: 0 18px 8px; }
  .error-list { max-height: 500px; overflow-y: auto; }
  .error-row { display: flex; gap: 10px; padding: 10px 18px; border-bottom: 1px solid #1a1d2b; align-items: flex-start; cursor: pointer; transition: background 0.1s; }
  .error-row:hover { background: #1e2030; }
  .error-row:last-child { border-bottom: none; }
  .error-level { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
  .error-level.error { background: #3b1419; color: #ef4444; }
  .error-level.warn { background: #3b2e10; color: #f59e0b; }
  .error-source { font-size: 10px; font-weight: 700; color: #64748b; background: #1e2030; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
  .error-msg { font-size: 12px; color: #cbd5e1; font-family: 'SF Mono', 'Menlo', monospace; word-break: break-all; line-height: 1.5; flex: 1; }
  .error-msg.expanded { white-space: pre-wrap; }
  .error-msg:not(.expanded) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 800px; }
  .error-time { font-size: 11px; color: #4a5568; flex-shrink: 0; white-space: nowrap; }
  .error-empty { padding: 32px; text-align: center; color: #64748b; font-size: 13px; }
  .error-list::-webkit-scrollbar { width: 6px; }
  .error-list::-webkit-scrollbar-track { background: transparent; }
  .error-list::-webkit-scrollbar-thumb { background: #252836; border-radius: 3px; }
  .error-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 11px; font-weight: 800; margin-left: 6px; }
  .error-badge.has-errors { background: #3b1419; color: #ef4444; }
  .error-badge.no-errors { background: #14532d; color: #4ade80; }

  .db-browser { padding: 8px 32px 32px; }
  .db-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .db-tab { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; background: #252836; color: #94a3b8; border: 1px solid #252836; cursor: pointer; transition: all 0.15s; }
  .db-tab:hover { background: #1e2030; color: #e2e8f0; }
  .db-tab.active { background: #f59e0b; color: #0f1117; border-color: #f59e0b; }
  .db-search { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #252836; background: #181b27; color: #e2e8f0; font-size: 13px; outline: none; margin-bottom: 12px; }
  .db-search:focus { border-color: #f59e0b; }
  .db-search::placeholder { color: #4a5568; }
  .db-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #252836; }
  .db-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .db-table th { padding: 8px 10px; background: #181b27; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252836; white-space: nowrap; position: sticky; top: 0; }
  .db-table td { padding: 6px 10px; border-bottom: 1px solid #1a1d2b; color: #cbd5e1; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'SF Mono', 'Menlo', monospace; font-size: 11px; }
  .db-table tr:hover td { background: #1e2030; }
  .db-table td.id-cell { color: #f59e0b; font-weight: 600; }
  .db-table td.fk-cell { color: #60a5fa; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; }
  .db-table td.fk-cell:hover { color: #93bbfd; }
  .db-pager { display: flex; align-items: center; gap: 12px; margin-top: 12px; justify-content: space-between; }
  .db-pager-info { font-size: 12px; color: #64748b; }
  .db-pager-btns { display: flex; gap: 6px; }
  .db-pager-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #252836; background: #181b27; color: #94a3b8; font-size: 12px; font-weight: 600; cursor: pointer; }
  .db-pager-btn:hover { background: #252836; color: #e2e8f0; }
  .db-pager-btn:disabled { opacity: 0.4; cursor: default; }
  .db-count { font-size: 12px; color: #64748b; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="header">
  <h1>Kistle <span>Dashboard</span></h1>
  <div class="refresh-info">
    <span class="status-dot ok" id="statusDot"></span>
    <span id="lastUpdate">Laden...</span>
  </div>
</div>

<div class="grid" id="statsGrid">
  <div class="card"><div class="card-label">Benutzer</div><div class="card-value" id="userCount">–</div></div>
  <div class="card"><div class="card-label">Gruppen</div><div class="card-value" id="groupCount">–</div></div>
  <div class="card"><div class="card-label">Boxen / Container</div><div class="card-value" id="boxCount">–</div><div class="type-chips" id="boxTypes"></div></div>
  <div class="card"><div class="card-label">Gegenstände</div><div class="card-value" id="productCount">–</div></div>
  <div class="card"><div class="card-label">Buchungen</div><div class="card-value" id="bookingCount">–</div></div>
  <div class="card"><div class="card-label">CPU-Temp</div><div class="card-value" id="tempValue">–</div></div>
  <div class="card"><div class="card-label">Uptime</div><div class="card-value" style="font-size:18px" id="uptimeValue">–</div></div>
  <div class="card">
    <div class="card-label">Speicher (RAM)</div>
    <div class="card-value" id="memValue">–</div>
    <div class="progress-bar"><div class="progress-fill" id="memBar" style="width:0;background:#3b82f6"></div></div>
    <div class="card-sub" id="memSub"></div>
  </div>
  <div class="card">
    <div class="card-label">Festplatte</div>
    <div class="card-value" id="diskValue">–</div>
    <div class="progress-bar"><div class="progress-fill" id="diskBar" style="width:0;background:#8b5cf6"></div></div>
    <div class="card-sub" id="diskSub"></div>
  </div>
</div>

<div class="section">
  <div class="wide-grid">
    <div class="panel" style="padding:0;overflow:hidden">
      <div class="section-title" style="padding:18px 18px 0">Fehler-Log <span class="error-badge no-errors" id="errorBadge">0</span></div>
      <div class="error-toolbar">
        <button class="error-filter active" data-filter="all" onclick="setErrorFilter('all')">Alle</button>
        <button class="error-filter" data-filter="error" onclick="setErrorFilter('error')">Errors</button>
        <button class="error-filter" data-filter="warn" onclick="setErrorFilter('warn')">Warnings</button>
        <button class="error-filter" data-filter="webapp" onclick="setErrorFilter('webapp')">Webapp</button>
        <button class="error-filter" data-filter="nginx" onclick="setErrorFilter('nginx')">Nginx</button>
        <button class="error-filter" data-filter="lock" onclick="setErrorFilter('lock')">Lock</button>
        <input class="error-search" id="errorSearch" type="text" placeholder="Fehler durchsuchen..." oninput="filterErrors()" />
      </div>
      <div class="error-count" id="errorCount"></div>
      <div class="error-list" id="errorList"><div class="error-empty">Laden...</div></div>
    </div>
    <div>
      <div class="panel" style="margin-bottom:14px">
        <div class="section-title">Docker Container</div>
        <div id="containers"><span style="color:#64748b">Laden...</span></div>
      </div>
      <div class="panel">
        <div class="section-title">Benutzer</div>
        <table>
          <thead><tr><th></th><th>Name</th><th>E-Mail</th><th>Registriert</th></tr></thead>
          <tbody id="usersTable"><tr><td colspan="4" style="color:#64748b">Laden...</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<div class="groups-browser">
  <div class="section-title">Gruppen & Gegenstände</div>
  <div id="groupsList"><span style="color:#64748b">Laden...</span></div>
</div>

<div class="db-browser">
  <div class="section-title">Datenbank</div>
  <div class="db-tabs" id="dbTabs"></div>
  <input class="db-search" id="dbSearch" type="text" placeholder="Suche nach ID, Name, E-Mail..." oninput="dbSearch(this.value)" />
  <div id="dbContent"><span style="color:#64748b">Laden...</span></div>
</div>

<script>
function fmt(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

async function loadStats() {
  try {
    const [stats, server] = await Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/server').then(r => r.json()),
    ]);

    if (stats.error || server.error) throw new Error(stats.error || server.error);

    document.getElementById('statusDot').className = 'status-dot ok';
    document.getElementById('lastUpdate').textContent = 'Aktualisiert: ' + new Date().toLocaleTimeString('de-DE');

    document.getElementById('userCount').textContent = stats.users.total;
    document.getElementById('groupCount').textContent = stats.groups;
    const totalBoxes = stats.boxes.reduce((s, b) => s + b.count, 0);
    document.getElementById('boxCount').textContent = totalBoxes;
    document.getElementById('boxTypes').innerHTML = stats.boxes.map(b =>
      '<span class="type-chip">' + esc(b.type) + ': ' + b.count + '</span>'
    ).join('');
    document.getElementById('productCount').textContent = stats.products;
    document.getElementById('bookingCount').textContent = stats.bookings.total;

    const temp = server.temperature;
    const cls = temp < 50 ? 'temp-ok' : temp < 70 ? 'temp-warm' : 'temp-hot';
    document.getElementById('tempValue').innerHTML = '<span class="' + cls + '">' + temp + '°C</span>';
    document.getElementById('uptimeValue').textContent = server.uptime;

    const memPct = Math.round(server.memory.used / server.memory.total * 100);
    document.getElementById('memValue').textContent = memPct + '%';
    document.getElementById('memBar').style.width = memPct + '%';
    document.getElementById('memSub').textContent = server.memory.used + ' / ' + server.memory.total + ' MB';

    document.getElementById('diskValue').textContent = server.disk.percent;
    document.getElementById('diskBar').style.width = server.disk.percent;
    document.getElementById('diskSub').textContent = server.disk.used + ' / ' + server.disk.total;

    document.getElementById('containers').innerHTML = server.containers.map(c =>
      '<div class="container-row">' +
        '<div class="container-dot ' + (c.status.startsWith('Up') ? 'up' : 'down') + '"></div>' +
        '<div class="container-name">' + esc(c.name) + '</div>' +
        '<div class="container-status">' + esc(c.status) + '</div>' +
      '</div>'
    ).join('');

    document.getElementById('usersTable').innerHTML = stats.users.list.map(u =>
      '<tr><td>' + (u.photo_url ? '<img class="user-avatar" src="' + esc(u.photo_url) + '" referrerpolicy="no-referrer" />' : '<div class="user-avatar"></div>') +
      '</td><td>' + esc(u.display_name) + '</td><td style="font-size:12px;color:#94a3b8">' + esc(u.email) + '</td><td>' + fmt(u.created_at) + '</td></tr>'
    ).join('');

  } catch (e) {
    document.getElementById('statusDot').className = 'status-dot err';
    document.getElementById('lastUpdate').textContent = 'Fehler: ' + e.message;
  }
}

loadStats();
setInterval(loadStats, 30000);

const typeLabels = { box: 'Box', trolley: 'Trolley', kiste: 'Kiste', karton: 'Karton', regal: 'Regal', other: 'Sonstige' };

async function loadGroups() {
  try {
    const groups = await fetch('/api/groups').then(r => r.json());
    if (groups.error) throw new Error(groups.error);

    const el = document.getElementById('groupsList');
    if (groups.length === 0) { el.innerHTML = '<span style="color:#64748b">Keine Gruppen vorhanden</span>'; return; }

    el.innerHTML = groups.map((g, gi) => {
      const boxesHtml = g.boxes.map((b, bi) =>
        '<div class="box-row" onclick="toggleProducts(this, \\'' + b.id + '\\')">' +
          '<div class="box-color-dot" style="background:' + (b.color || '#64748b') + '"></div>' +
          '<div class="box-info"><div class="box-label">' + esc(b.name) + (b.box_number ? ' <span style="color:#64748b">#' + b.box_number + '</span>' : '') + '</div>' +
          '<div class="box-sublabel">' + esc(b.description || '') + '</div></div>' +
          '<span class="box-type-badge">' + (typeLabels[b.type] || b.type) + '</span>' +
          '<span class="box-count">' + b.productCount + '</span>' +
        '</div>' +
        '<div class="products-panel" id="products-' + b.id + '"></div>'
      ).join('');

      const unboxedHtml = g.unboxedProducts > 0 ?
        '<div class="unboxed-row" onclick="toggleProducts(this, \\'' + g.id + '\\')">' +
          '<div class="box-color-dot" style="background:#64748b"></div>' +
          '<div class="box-info"><div class="box-label">Ohne Box</div></div>' +
          '<span class="box-count">' + g.unboxedProducts + '</span>' +
        '</div>' +
        '<div class="products-panel" id="products-' + g.id + '"></div>' : '';

      return '<div class="group-card">' +
        '<div class="group-header" onclick="toggleGroup(' + gi + ')">' +
          '<div class="group-info">' +
            '<div class="group-icon" style="background:' + (g.color || '#252836') + '">' + (g.icon || '📦') + '</div>' +
            '<div><div class="group-name">' + esc(g.name) + '</div>' +
            (g.description ? '<div class="group-desc">' + esc(g.description) + '</div>' : '') + '</div>' +
          '</div>' +
          '<div class="group-meta">' +
            '<div class="group-stat"><strong>' + g.boxes.length + '</strong> Boxen</div>' +
            '<div class="group-stat"><strong>' + g.totalProducts + '</strong> Gegenstände</div>' +
            '<span class="group-chevron" id="chevron-' + gi + '">›</span>' +
          '</div>' +
        '</div>' +
        '<div class="group-body" id="group-body-' + gi + '">' +
          '<div class="box-list">' + boxesHtml + unboxedHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    document.getElementById('groupsList').innerHTML = '<span style="color:#ef4444">Fehler: ' + esc(e.message) + '</span>';
  }
}

function toggleGroup(idx) {
  const body = document.getElementById('group-body-' + idx);
  const chev = document.getElementById('chevron-' + idx);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  chev.classList.toggle('open');
}

async function toggleProducts(rowEl, spaceId) {
  const panel = document.getElementById('products-' + spaceId);
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    return;
  }
  panel.innerHTML = '<div class="empty-products">Laden...</div>';
  panel.classList.add('open');

  try {
    const products = await fetch('/api/spaces/' + spaceId + '/products').then(r => r.json());
    if (products.length === 0) {
      panel.innerHTML = '<div class="empty-products">Keine Gegenstände</div>';
      return;
    }
    panel.innerHTML = products.map(p =>
      '<div class="product-row">' +
        '<div class="product-color" style="background:' + (p.color || '#3b82f6') + '"></div>' +
        '<div style="flex:1">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="product-name">' + esc(p.name) + '</span>' +
            (p.category ? '<span class="product-cat">' + esc(p.category) + '</span>' : '') +
          '</div>' +
          (p.description ? '<div class="product-desc">' + esc(p.description) + '</div>' : '') +
        '</div>' +
        '<span class="product-qty">' + p.quantity + '</span>' +
        '<span class="product-unit">' + esc(p.unit) + '</span>' +
      '</div>'
    ).join('');
  } catch (e) {
    panel.innerHTML = '<div class="empty-products" style="color:#ef4444">Fehler: ' + esc(e.message) + '</div>';
  }
}

loadGroups();

// === Error Log ===
let errorData = [];
let errorFilter = 'all';

async function loadErrors() {
  try {
    const data = await fetch('/api/errors').then(r => r.json());
    if (data.error) throw new Error(data.error);
    errorData = data.errors || [];
    const errCount = errorData.filter(e => e.level === 'error').length;
    const badge = document.getElementById('errorBadge');
    badge.textContent = errCount;
    badge.className = 'error-badge ' + (errCount > 0 ? 'has-errors' : 'no-errors');
    filterErrors();
  } catch (e) {
    document.getElementById('errorList').innerHTML = '<div class="error-empty" style="color:#ef4444">Fehler beim Laden: ' + esc(e.message) + '</div>';
  }
}

function setErrorFilter(f) {
  errorFilter = f;
  document.querySelectorAll('.error-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  filterErrors();
}

function filterErrors() {
  const search = (document.getElementById('errorSearch').value || '').toLowerCase();
  const filtered = errorData.filter(e => {
    if (errorFilter === 'error' && e.level !== 'error') return false;
    if (errorFilter === 'warn' && e.level !== 'warn') return false;
    if (errorFilter === 'webapp' && e.source !== 'webapp') return false;
    if (errorFilter === 'nginx' && e.source !== 'nginx') return false;
    if (errorFilter === 'lock' && e.source !== 'lock') return false;
    if (search && !e.message.toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('errorCount').textContent = filtered.length + ' von ' + errorData.length + ' Einträgen';

  if (filtered.length === 0) {
    document.getElementById('errorList').innerHTML = '<div class="error-empty">' + (errorData.length === 0 ? 'Keine Fehler gefunden ✓' : 'Keine Treffer für diesen Filter') + '</div>';
    return;
  }

  document.getElementById('errorList').innerHTML = filtered.map((e, i) => {
    const time = e.timestamp ? fmtErrorTime(e.timestamp) : '';
    return '<div class="error-row" onclick="toggleErrorExpand(this)">' +
      '<span class="error-level ' + e.level + '">' + e.level + '</span>' +
      '<span class="error-source">' + esc(e.source) + '</span>' +
      '<span class="error-msg">' + esc(e.message) + '</span>' +
      '<span class="error-time">' + time + '</span>' +
    '</div>';
  }).join('');
}

function toggleErrorExpand(row) {
  const msg = row.querySelector('.error-msg');
  msg.classList.toggle('expanded');
}

function fmtErrorTime(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch { return ts; }
}

loadErrors();
setInterval(loadErrors, 30000);

// === DB Browser ===
const DB_TABLES = ['users','spaces','space_members','products','bookings','booking_items','booking_parent_spaces','notifications','folders','documents','push_subscriptions'];
const FK_MAP = {
  owner_id: 'users', user_id: 'users', target_user_id: 'users', last_modified_by: 'users',
  space_id: 'spaces', parent_id: 'spaces', group_id: 'spaces',
  booking_id: 'bookings', original_booking_id: 'bookings',
  product_id: 'products', folder_id: 'folders',
};
const ID_COLS = ['id', 'uid'];

let dbState = { table: 'users', offset: 0, search: '', data: null };

function renderDbTabs() {
  return DB_TABLES.map(t =>
    '<button class="db-tab' + (dbState.table === t ? ' active' : '') + '" onclick="switchDbTable(\\'' + t + '\\')">' + t + '</button>'
  ).join('');
}

async function loadDbTable() {
  const el = document.getElementById('dbContent');
  el.innerHTML = '<span style="color:#64748b">Laden...</span>';
  try {
    const params = new URLSearchParams({ limit: 100, offset: dbState.offset });
    if (dbState.search) params.set('search', dbState.search);
    const data = await fetch('/api/db/' + dbState.table + '?' + params).then(r => r.json());
    if (data.error) throw new Error(data.error);
    dbState.data = data;
    renderDbContent();
  } catch (e) {
    el.innerHTML = '<span style="color:#ef4444">Fehler: ' + esc(e.message) + '</span>';
  }
}

function renderDbContent() {
  const { columns, rows, total, limit, offset } = dbState.data;
  const el = document.getElementById('dbContent');

  const thead = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
  const tbody = rows.map(row =>
    '<tr>' + columns.map(col => {
      const val = row[col] ?? '';
      const isId = ID_COLS.includes(col);
      const fkTable = FK_MAP[col];
      if (fkTable && val) {
        return '<td class="fk-cell" title="Zeige in ' + fkTable + '" onclick="jumpToFk(\\'' + fkTable + '\\',\\'' + val.replace(/'/g, "\\\\'") + '\\')">' + esc(val) + '</td>';
      }
      return '<td' + (isId ? ' class="id-cell"' : '') + ' title="' + esc(val) + '">' + esc(val) + '</td>';
    }).join('') + '</tr>'
  ).join('');

  const from = rows.length > 0 ? offset + 1 : 0;
  const to = offset + rows.length;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  el.innerHTML =
    '<div class="db-count">' + total + ' Einträge in <strong>' + dbState.table + '</strong></div>' +
    '<div class="db-table-wrap"><table class="db-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>' +
    '<div class="db-pager">' +
      '<div class="db-pager-info">' + from + '–' + to + ' von ' + total + '</div>' +
      '<div class="db-pager-btns">' +
        '<button class="db-pager-btn" onclick="dbPage(-1)"' + (hasPrev ? '' : ' disabled') + '>← Zurück</button>' +
        '<button class="db-pager-btn" onclick="dbPage(1)"' + (hasNext ? '' : ' disabled') + '>Weiter →</button>' +
      '</div>' +
    '</div>';
}

function switchDbTable(t) {
  dbState.table = t; dbState.offset = 0; dbState.search = '';
  document.getElementById('dbSearch').value = '';
  document.getElementById('dbTabs').innerHTML = renderDbTabs();
  loadDbTable();
}

function dbPage(dir) {
  const limit = dbState.data?.limit || 100;
  dbState.offset = Math.max(0, dbState.offset + dir * limit);
  loadDbTable();
}

function dbSearch(val) {
  dbState.search = val; dbState.offset = 0;
  clearTimeout(dbSearch._t);
  dbSearch._t = setTimeout(loadDbTable, 400);
}

function jumpToFk(table, value) {
  dbState.table = table; dbState.offset = 0; dbState.search = value;
  document.getElementById('dbSearch').value = value;
  document.getElementById('dbTabs').innerHTML = renderDbTabs();
  loadDbTable();
}

document.getElementById('dbTabs').innerHTML = renderDbTabs();
loadDbTable();
</script>
</body>
</html>`;

app.listen(PORT, () => {
  console.log(`\n  Kistle Dashboard: http://localhost:${PORT}\n`);
});
