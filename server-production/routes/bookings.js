const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware');
const { sendPushToUser } = require("../push");
const { broadcast } = require('../ws');
const { decrementProductStock, incrementProductStock } = require('../inventory');
const {
  READ_ROLES,
  WRITE_ROLES,
  getSpaceAccess,
  getBookingAccess,
  hasRole,
  forbidden,
} = require('../authorization');

function requestError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapBooking(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name,
    userEmail: row.user_email,
    type: row.type,
    originalBookingId: row.original_booking_id,
    isReturned: row.is_returned,
    createdAt: row.created_at,
    parentIds: row.parent_ids || [],
    items: (row.items || []).filter(Boolean).map(i => ({
      productId: i.product_id,
      productName: i.product_name,
      quantity: parseFloat(i.quantity),
      unit: i.unit,
      imageUrl: i.image_url,
      boxId: i.box_id,
      boxName: i.box_name,
      boxNumber: i.box_number != null ? parseInt(i.box_number, 10) : null,
      parentId: i.parent_id,
      parentName: i.parent_name,
    })),
  };
}

async function notifyAdmins(spaceIds, currentUserId, displayName, message, type) {
  for (const spaceId of spaceIds) {
    const spaceRes = await pool.query('SELECT name FROM spaces WHERE id=$1', [spaceId]);
    const spaceName = spaceRes.rows[0]?.name || '';
    const adminsRes = await pool.query(
      `SELECT user_id FROM space_members WHERE space_id=$1 AND role IN ('admin', 'owner') AND user_id != $2
       UNION SELECT owner_id FROM spaces WHERE id=$1 AND owner_id != $2`,
      [spaceId, currentUserId]
    );
    for (const row of adminsRes.rows) {
      const nid = (await pool.query('SELECT gen_random_uuid()::text AS id')).rows[0].id;
      await pool.query(
        `INSERT INTO notifications (id, target_user_id, booking_user_name, group_id, group_name, message, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [nid, row.user_id, displayName, spaceId, spaceName, message, type]
      );
      try {
        await sendPushToUser(row.user_id, { title: spaceName || 'Kistle', body: message });
      } catch (pushErr) {
        console.error('Push send error:', pushErr.message);
      }
    }
  }
}

// GET /bookings?groupId=
router.get('/', auth, async (req, res) => {
  const { groupId } = req.query;
  try {
    let rows;
    if (groupId) {
      const access = await getSpaceAccess(req.user.uid, groupId);
      if (!hasRole(access, READ_ROLES)) return forbidden(res);
      const result = await pool.query(
        `SELECT b.*,
          COALESCE(json_agg(DISTINCT jsonb_build_object(
            'product_id', bi.product_id, 'product_name', bi.product_name,
            'quantity', bi.quantity, 'unit', bi.unit, 'image_url', bi.image_url,
            'box_id', bi.box_id, 'box_name', bi.box_name, 'box_number', box_s.box_number,
            'parent_id', bi.parent_id, 'parent_name', bi.parent_name
          )) FILTER (WHERE bi.id IS NOT NULL), '[]') AS items,
          COALESCE(array_agg(DISTINCT bps.space_id) FILTER (WHERE bps.space_id IS NOT NULL), '{}') AS parent_ids
         FROM bookings b
         JOIN booking_parent_spaces bps_filter ON bps_filter.booking_id = b.id AND bps_filter.space_id = $1
         LEFT JOIN booking_items bi ON bi.booking_id = b.id
         LEFT JOIN spaces box_s ON box_s.id = bi.box_id
         LEFT JOIN booking_parent_spaces bps ON bps.booking_id = b.id
         GROUP BY b.id
         ORDER BY b.created_at DESC`,
        [groupId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT b.*,
          COALESCE(json_agg(DISTINCT jsonb_build_object(
            'product_id', bi.product_id, 'product_name', bi.product_name,
            'quantity', bi.quantity, 'unit', bi.unit, 'image_url', bi.image_url,
            'box_id', bi.box_id, 'box_name', bi.box_name, 'box_number', box_s.box_number,
            'parent_id', bi.parent_id, 'parent_name', bi.parent_name
          )) FILTER (WHERE bi.id IS NOT NULL), '[]') AS items,
          COALESCE(array_agg(DISTINCT bps.space_id) FILTER (WHERE bps.space_id IS NOT NULL), '{}') AS parent_ids
         FROM bookings b
         LEFT JOIN booking_items bi ON bi.booking_id = b.id
         LEFT JOIN spaces box_s ON box_s.id = bi.box_id
         LEFT JOIN booking_parent_spaces bps ON bps.booking_id = b.id
         WHERE b.user_id = $1
         GROUP BY b.id
         ORDER BY b.created_at DESC`,
        [req.user.uid]
      );
      rows = result.rows;
    }
    res.json(rows.map(mapBooking));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

// GET /bookings/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const bookingAccess = await getBookingAccess(req.user.uid, req.params.id);
    if (!bookingAccess) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!bookingAccess.canRead) return forbidden(res);
    const { rows } = await pool.query(
      `SELECT b.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'product_id', bi.product_id, 'product_name', bi.product_name,
          'quantity', bi.quantity, 'unit', bi.unit, 'image_url', bi.image_url,
          'box_id', bi.box_id, 'box_name', bi.box_name, 'box_number', box_s.box_number,
          'parent_id', bi.parent_id, 'parent_name', bi.parent_name
        )) FILTER (WHERE bi.id IS NOT NULL), '[]') AS items,
        COALESCE(array_agg(DISTINCT bps.space_id) FILTER (WHERE bps.space_id IS NOT NULL), '{}') AS parent_ids
       FROM bookings b
       LEFT JOIN booking_items bi ON bi.booking_id = b.id
       LEFT JOIN spaces box_s ON box_s.id = bi.box_id
       LEFT JOIN booking_parent_spaces bps ON bps.booking_id = b.id
       WHERE b.id = $1
       GROUP BY b.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(mapBooking(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler' });
  }
});

// POST /bookings  (Abbuchung)
router.post('/', auth, async (req, res) => {
  const { id, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Keine Items' });
  if (!Array.isArray(items) || items.length > 100) return res.status(400).json({ error: 'Ungültige Anzahl Items' });
  if (new Set(items.map(item => item.productId)).size !== items.length) {
    return res.status(400).json({ error: 'Doppelte Produkte sind nicht erlaubt' });
  }

  const bookingId = id || (await pool.query('SELECT gen_random_uuid()::text AS id')).rows[0].id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // User info
    const userRes = await client.query('SELECT display_name, email FROM users WHERE uid=$1', [req.user.uid]);
    const displayName = userRes.rows[0]?.display_name || '';
    const email = userRes.rows[0]?.email || '';

    await client.query(
      `INSERT INTO bookings (id, user_id, user_display_name, user_email, type)
       VALUES ($1,$2,$3,$4,'booking')`,
      [bookingId, req.user.uid, displayName, email]
    );

    const trustedItems = [];
    const updatedProducts = [];
    const spaceIds = new Set();
    for (const item of items) {
      const qty = Number(item.quantity ?? item.cartQuantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw requestError(400, 'Ungültige Menge');

      const productRes = await client.query(
        `SELECT p.*, s.name AS box_name, s.box_number, s.parent_id,
           parent.name AS parent_name, s.is_group
         FROM products p
         JOIN spaces s ON s.id = p.space_id
         LEFT JOIN spaces parent ON parent.id = s.parent_id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [item.productId]
      );
      if (!productRes.rows.length) throw requestError(404, 'Produkt nicht gefunden');
      const product = productRes.rows[0];
      const access = await getSpaceAccess(req.user.uid, product.space_id, client);
      if (!hasRole(access, WRITE_ROLES)) throw requestError(403, 'Nicht berechtigt');
      if (Number(product.quantity) < qty) throw requestError(409, 'Nicht genügend Bestand');

      const parentId = product.parent_id || product.space_id;
      spaceIds.add(parentId);
      const trustedItem = {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unit: product.unit,
        imageUrl: product.image_url,
        boxId: product.space_id,
        boxName: product.box_name,
        parentId,
        parentName: product.parent_name || product.box_name,
      };
      trustedItems.push(trustedItem);
      await client.query(
        `INSERT INTO booking_items (booking_id, product_id, product_name, quantity, unit, image_url, box_id, box_name, parent_id, parent_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bookingId, trustedItem.productId, trustedItem.productName, qty, trustedItem.unit,
         trustedItem.imageUrl || null, trustedItem.boxId, trustedItem.boxName,
         trustedItem.parentId, trustedItem.parentName]
      );
      // Lagerbestand abziehen
      updatedProducts.push(await decrementProductStock(
        client,
        trustedItem.productId,
        qty,
        req.user.uid
      ));
    }

    // Parent-Spaces verknüpfen
    for (const spaceId of spaceIds) {
      await client.query(
        'INSERT INTO booking_parent_spaces (booking_id, space_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [bookingId, spaceId]
      );
    }

    await client.query('COMMIT');

    // Benachrichtigungen nur für Admins (buchender User ausgeschlossen)
    try {
      const totalQty = trustedItems.reduce((sum, item) => sum + item.quantity, 0);
      const posCount = trustedItems.length;
      const plural = totalQty !== 1 ? 'e' : '';
      const posPlural = posCount !== 1 ? 'en' : '';
      const message = displayName + ' hat ' + totalQty + ' Gegenstand' + plural + ' (' + posCount + ' Position' + posPlural + ') abgebucht';
      await notifyAdmins([...spaceIds], req.user.uid, displayName, message, 'booking');
    } catch (notifErr) {
      console.error('Notification error:', notifErr);
    }

    res.json({ id: bookingId, products: updatedProducts });
    broadcast('bookings', {});
    broadcast('products', {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Fehler beim Abbuchen' });
  } finally {
    client.release();
  }
});

// POST /bookings/:id/return  (Rückgabe)
router.post('/:id/return', auth, async (req, res) => {
  const bookingAccess = await getBookingAccess(req.user.uid, req.params.id);
  if (!bookingAccess) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!bookingAccess.canWrite) return forbidden(res);
  const client = await pool.connect();
  try {
    // Original-Buchung laden
    const origRes = await client.query(
      `SELECT b.*, json_agg(bi.*) as items FROM bookings b
       LEFT JOIN booking_items bi ON bi.booking_id = b.id
       WHERE b.id=$1 GROUP BY b.id`,
      [req.params.id]
    );
    if (!origRes.rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    const orig = origRes.rows[0];

    // Doppelte Rückbuchung verhindern
    const existingReturn = await client.query(
      "SELECT id FROM bookings WHERE original_booking_id=$1 AND type='return'",
      [req.params.id]
    );
    if (existingReturn.rows.length > 0) return res.status(409).json({ error: 'Bereits zurückgebucht' });

    // Optionale Teil-Rückgabe: items im Body überschreiben Mengen
    const bodyItems = req.body.items; // Array<{productId, quantity}> | undefined
    if (bodyItems !== undefined && !Array.isArray(bodyItems)) {
      throw requestError(400, 'Ungültige Rückgabe');
    }
    const origItems = (orig.items || []).filter(Boolean);
    const itemsToReturn = bodyItems && bodyItems.length > 0
      ? origItems
          .filter(i => bodyItems.some(b => b.productId === i.product_id))
          .map(i => {
            const override = bodyItems.find(b => b.productId === i.product_id);
            return { ...i, quantity: override ? override.quantity : i.quantity };
          })
      : origItems;

    if (itemsToReturn.length === 0) return res.status(400).json({ error: 'Keine Items zur Rückgabe' });
    for (const item of itemsToReturn) {
      const qty = Number(item.quantity);
      const originalQty = Number(origItems.find(origItem => origItem.product_id === item.product_id)?.quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0 || qty > originalQty) {
        throw requestError(400, 'Ungültige Rückgabemenge');
      }
      item.quantity = qty;
    }

    const returnId = (await pool.query('SELECT gen_random_uuid()::text AS id')).rows[0].id;
    const updatedProducts = [];
    const userRes = await client.query('SELECT display_name, email FROM users WHERE uid=$1', [req.user.uid]);
    const displayName = userRes.rows[0]?.display_name || '';
    const email = userRes.rows[0]?.email || '';

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO bookings (id, user_id, user_display_name, user_email, type, original_booking_id)
       VALUES ($1,$2,$3,$4,'return',$5)`,
      [returnId, req.user.uid, displayName, email, req.params.id]
    );

    for (const item of itemsToReturn) {
      await client.query(
        `INSERT INTO booking_items (booking_id, product_id, product_name, quantity, unit, image_url, box_id, box_name, parent_id, parent_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [returnId, item.product_id, item.product_name, item.quantity, item.unit,
         item.image_url, item.box_id, item.box_name, item.parent_id, item.parent_name || '']
      );
      // Lagerbestand wiederherstellen
      updatedProducts.push(await incrementProductStock(
        client,
        item.product_id,
        item.quantity,
        req.user.uid
      ));
    }

    // Original als zurückgegeben markieren (nur wenn alle Items zurückgegeben)
    const allReturned = !bodyItems || bodyItems.length === 0 || (
      origItems.length === itemsToReturn.length &&
      itemsToReturn.every(item => Number(item.quantity) === Number(origItems.find(origItem => origItem.product_id === item.product_id)?.quantity))
    );
    if (allReturned) {
      await client.query('UPDATE bookings SET is_returned=true WHERE id=$1', [req.params.id]);
    }

    // Parent-Spaces übernehmen
    const parentRes = await client.query('SELECT space_id FROM booking_parent_spaces WHERE booking_id=$1', [req.params.id]);
    const returnSpaceIds = [];
    for (const row of parentRes.rows) {
      await client.query(
        'INSERT INTO booking_parent_spaces (booking_id, space_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [returnId, row.space_id]
      );
      returnSpaceIds.push(row.space_id);
    }

    await client.query('COMMIT');

    // Benachrichtigungen nur für Admins (buchender User ausgeschlossen)
    try {
      const totalQty = itemsToReturn.reduce((s, i) => s + parseFloat(i.quantity), 0);
      const posCount = itemsToReturn.length;
      const plural = totalQty !== 1 ? 'e' : '';
      const posPlural = posCount !== 1 ? 'en' : '';
      const message = displayName + ' hat ' + totalQty + ' Gegenstand' + plural + ' (' + posCount + ' Position' + posPlural + ') zurückgebucht';
      await notifyAdmins(returnSpaceIds, req.user.uid, displayName, message, 'return');
    } catch (notifErr) {
      console.error('Return notification error:', notifErr);
    }

    res.json({ id: returnId, products: updatedProducts });
    broadcast('bookings', {});
    broadcast('products', {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Fehler bei Rückgabe' });
  } finally {
    client.release();
  }
});
// DELETE /bookings/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM bookings WHERE id=$1 AND user_id=$2', [req.params.id, req.user.uid]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

module.exports = router;
