import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import type { Product } from '../../../src/types/index.js';

const router = Router();
router.use(requireAuth);

function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id:                  r.id as string,
    name:                r.name as string,
    spaceId:             r.space_id as string,
    quantity:            (r.quantity as number) ?? 0,
    minQuantity:         (r.min_quantity as number | null) ?? null,
    unit:                (r.unit as Product['unit']) || 'Stück',
    category:            (r.category as string) || '',
    description:         (r.description as string) || '',
    barcode:             (r.barcode as string | null) ?? null,
    imageUrl:            (r.image_url as string | null) ?? null,
    color:               (r.color as string | undefined),
    lastModifiedBy:      (r.last_modified_by as string) || '',
    lastModifiedByEmail: (r.last_modified_by_email as string) || '',
    lastModifiedAt:      new Date(r.last_modified_at as string),
    createdAt:           new Date(r.created_at as string),
  };
}

// GET /products?spaceId=xxx | ?spaceIds=xxx,yyy,zzz
router.get('/', async (req, res) => {
  const { spaceId, spaceIds } = req.query as { spaceId?: string; spaceIds?: string };
  const rows = spaceIds
    ? await query('SELECT * FROM products WHERE space_id = ANY($1) ORDER BY name', [spaceIds.split(',')])
    : spaceId
    ? await query('SELECT * FROM products WHERE space_id = $1 ORDER BY name', [spaceId])
    : await query('SELECT * FROM products ORDER BY name');
  res.json(rows.map(rowToProduct));
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!row) { res.status(404).json({ error: 'Nicht gefunden' }); return; }
  res.json(rowToProduct(row));
});

// POST /products
router.post('/', async (req, res) => {
  const u = req.user!;
  const d = req.body as Partial<Product> & { spaceId: string };
  const [row] = await query<{ id: string }>(
    `INSERT INTO products
       (space_id, name, description, quantity, min_quantity, unit, category,
        barcode, image_url, color, last_modified_by, last_modified_by_email, last_modified_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id`,
    [d.spaceId, d.name, d.description ?? '', d.quantity ?? 0, d.minQuantity ?? null,
     d.unit ?? 'Stück', d.category ?? '', d.barcode ?? null, d.imageUrl ?? null,
     d.color ?? null, u.userId, u.email]
  );
  res.status(201).json({ id: row.id });
});

// PUT /products/:id
router.put('/:id', async (req, res) => {
  const u = req.user!;
  const d = req.body as Partial<Product>;
  await query(
    `UPDATE products SET
       name                   = COALESCE($1, name),
       description            = COALESCE($2, description),
       quantity               = COALESCE($3, quantity),
       min_quantity           = COALESCE($4, min_quantity),
       unit                   = COALESCE($5, unit),
       category               = COALESCE($6, category),
       barcode                = COALESCE($7, barcode),
       image_url              = COALESCE($8, image_url),
       color                  = COALESCE($9, color),
       last_modified_by       = $10,
       last_modified_by_email = $11,
       last_modified_at       = NOW()
     WHERE id = $12`,
    [d.name ?? null, d.description ?? null, d.quantity ?? null, d.minQuantity ?? null,
     d.unit ?? null, d.category ?? null, d.barcode ?? null, d.imageUrl ?? null,
     d.color ?? null, u.userId, u.email, req.params.id]
  );
  res.json({ ok: true });
});

// DELETE /products/:id
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
