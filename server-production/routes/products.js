const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware');
const { broadcast } = require('../ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  READ_ROLES,
  WRITE_ROLES,
  getSpaceAccess,
  getProductAccess,
  hasRole,
  forbidden,
} = require('../authorization');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.DATA_PATH + '/images'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)),
});

async function requireProductWrite(req, res, next) {
  try {
    const productAccess = await getProductAccess(req.user.uid, req.params.id);
    if (!productAccess) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasRole(productAccess.access, WRITE_ROLES)) return forbidden(res);
    req.productAccess = productAccess;
    next();
  } catch (err) {
    next(err);
  }
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    spaceId: row.space_id,
    quantity: parseFloat(row.quantity),
    minQuantity: row.min_quantity !== null ? parseFloat(row.min_quantity) : null,
    unit: row.unit,
    category: row.category,
    description: row.description,
    barcode: row.barcode,
    imageUrl: row.image_url,
    color: row.color,
    lastModifiedBy: row.last_modified_by,
    lastModifiedByEmail: '',
    lastModifiedAt: row.last_modified_at,
    createdAt: row.created_at,
  };
}

// GET /products?spaceId= oder GET /products?spaceIds=a,b,c
router.get('/', auth, async (req, res) => {
  const { spaceId, spaceIds } = req.query;
  try {
    let rows;
    if (spaceIds) {
      const ids = spaceIds.split(',').filter(Boolean);
      if (ids.length > 200) return res.status(400).json({ error: 'Zu viele Lagerorte' });
      ({ rows } = await pool.query(
        `SELECT DISTINCT p.* FROM products p
         JOIN spaces s ON s.id = p.space_id
         LEFT JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = $1
         LEFT JOIN space_members sm_parent ON sm_parent.space_id = s.parent_id AND sm_parent.user_id = $1
         WHERE p.space_id = ANY($2)
         AND (s.owner_id = $1 OR sm.user_id = $1 OR sm_parent.user_id = $1)
         ORDER BY p.name ASC`,
        [req.user.uid, ids]
      ));
    } else if (spaceId) {
      const access = await getSpaceAccess(req.user.uid, spaceId);
      if (!hasRole(access, READ_ROLES)) return forbidden(res);
      ({ rows } = await pool.query('SELECT * FROM products WHERE space_id=$1 ORDER BY name ASC', [spaceId]));
    } else {
      ({ rows } = await pool.query(
        `SELECT DISTINCT p.* FROM products p
         JOIN spaces s ON s.id = p.space_id
         LEFT JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = $1
         LEFT JOIN space_members sm_parent ON sm_parent.space_id = s.parent_id AND sm_parent.user_id = $1
         WHERE s.owner_id = $1 OR sm.user_id = $1 OR sm_parent.user_id = $1
         ORDER BY p.name ASC`,
        [req.user.uid]
      ));
    }
    res.json(rows.map(mapProduct));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Laden' });
  }
});

// POST /products
router.post('/', auth, async (req, res) => {
  const { id, name, description, category, barcode, quantity, minQuantity, unit, spaceId, imageUrl, color } = req.body;
  const productId = id || (await pool.query('SELECT gen_random_uuid()::text AS id')).rows[0].id;
  try {
    if (!name || !spaceId || !unit) return res.status(400).json({ error: 'Fehlende Felder' });
    const access = await getSpaceAccess(req.user.uid, spaceId);
    if (!hasRole(access, WRITE_ROLES)) return forbidden(res);
    const parsedQuantity = Number(quantity ?? 0);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({ error: 'Ungültige Menge' });
    }
    await pool.query(
      `INSERT INTO products (id, name, description, category, barcode, quantity, min_quantity, unit, space_id, image_url, color, last_modified_by, last_modified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [productId, name, description || '', category || '', barcode || null,
       parsedQuantity, minQuantity ?? null, unit, spaceId,
       imageUrl || null, color || null, req.user.uid]
    );
    res.json({ id: productId });
    broadcast('products', { spaceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen' });
  }
});

// PUT /products/:id
router.put('/:id', auth, async (req, res) => {
  const { name, description, category, barcode, quantity, minQuantity, unit, imageUrl, color } = req.body;
  try {
    const productAccess = await getProductAccess(req.user.uid, req.params.id);
    if (!productAccess) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasRole(productAccess.access, WRITE_ROLES)) return forbidden(res);
    if (quantity !== undefined && (!Number.isFinite(Number(quantity)) || Number(quantity) < 0)) {
      return res.status(400).json({ error: 'Ungültige Menge' });
    }
    await pool.query(
      `UPDATE products SET name=$1, description=$2, category=$3, barcode=$4,
       quantity=$5, min_quantity=$6, unit=$7, image_url=$8, color=$9,
       last_modified_by=$10, last_modified_at=NOW()
       WHERE id=$11`,
      [name, description ?? '', category ?? '', barcode ?? null,
       quantity ?? 0, minQuantity ?? null, unit,
       imageUrl !== undefined ? imageUrl : null,
       color ?? null, req.user.uid, req.params.id]
    );
    res.json({ success: true });
    broadcast('products', { productId: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Updaten' });
  }
});

// DELETE /products/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const productAccess = await getProductAccess(req.user.uid, req.params.id);
    if (!productAccess) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!hasRole(productAccess.access, WRITE_ROLES)) return forbidden(res);
    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ success: true });
    broadcast('products', {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// POST /products/:id/image
router.post('/:id/image', auth, requireProductWrite, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ungültige Bilddatei' });
    const imageUrl = '/api/images/' + req.file.filename;
    await pool.query('UPDATE products SET image_url=$1 WHERE id=$2', [imageUrl, req.params.id]);
    res.json({ imageUrl });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Upload' });
  }
});

module.exports = router;
