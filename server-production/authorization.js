const pool = require('./db');

const READ_ROLES = new Set(['owner', 'admin', 'editor', 'viewer']);
const WRITE_ROLES = new Set(['owner', 'admin', 'editor']);
const ADMIN_ROLES = new Set(['owner', 'admin']);

async function getSpaceAccess(uid, spaceId, client = pool) {
  const { rows } = await client.query(
    `SELECT s.id, s.owner_id, s.parent_id,
       CASE
         WHEN s.owner_id = $1 THEN 'owner'
         ELSE COALESCE(sm.role, sm_parent.role)
       END AS role
     FROM spaces s
     LEFT JOIN space_members sm
       ON sm.space_id = s.id AND sm.user_id = $1
     LEFT JOIN space_members sm_parent
       ON sm_parent.space_id = s.parent_id AND sm_parent.user_id = $1
     WHERE s.id = $2`,
    [uid, spaceId]
  );
  return rows[0] || null;
}

function hasRole(access, allowedRoles) {
  return Boolean(access && allowedRoles.has(access.role));
}

async function getProductAccess(uid, productId, client = pool) {
  const { rows } = await client.query(
    'SELECT id, space_id FROM products WHERE id = $1',
    [productId]
  );
  if (!rows.length) return null;
  const product = rows[0];
  const access = await getSpaceAccess(uid, product.space_id, client);
  return access ? { product, access } : null;
}

async function getBookingAccess(uid, bookingId, client = pool) {
  const { rows } = await client.query(
    `SELECT b.id, b.user_id,
       COALESCE(bool_or(
         s.owner_id = $1 OR sm.role IN ('owner', 'admin', 'editor', 'viewer')
       ), false) AS can_read,
       COALESCE(bool_or(
         s.owner_id = $1 OR sm.role IN ('owner', 'admin', 'editor')
       ), false) AS can_write
     FROM bookings b
     LEFT JOIN booking_parent_spaces bps ON bps.booking_id = b.id
     LEFT JOIN spaces s ON s.id = bps.space_id
     LEFT JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = $1
     WHERE b.id = $2
     GROUP BY b.id, b.user_id`,
    [uid, bookingId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    isOwner: row.user_id === uid,
    canRead: row.user_id === uid || row.can_read,
    canWrite: row.user_id === uid || row.can_write,
  };
}

function forbidden(res) {
  return res.status(403).json({ error: 'Nicht berechtigt' });
}

module.exports = {
  READ_ROLES,
  WRITE_ROLES,
  ADMIN_ROLES,
  getSpaceAccess,
  getProductAccess,
  getBookingAccess,
  hasRole,
  forbidden,
};
