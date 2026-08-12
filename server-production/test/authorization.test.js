const test = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../db');
const {
  READ_ROLES,
  WRITE_ROLES,
  ADMIN_ROLES,
  getSpaceAccess,
  getBookingAccess,
  hasRole,
} = require('../authorization');

test('role sets enforce read, write, and admin boundaries', () => {
  assert.equal(hasRole({ role: 'viewer' }, READ_ROLES), true);
  assert.equal(hasRole({ role: 'viewer' }, WRITE_ROLES), false);
  assert.equal(hasRole({ role: 'editor' }, WRITE_ROLES), true);
  assert.equal(hasRole({ role: 'editor' }, ADMIN_ROLES), false);
  assert.equal(hasRole({ role: 'admin' }, ADMIN_ROLES), true);
  assert.equal(hasRole(null, READ_ROLES), false);
});

test('space access returns null for an unknown or inaccessible space', async (t) => {
  const originalQuery = pool.query;
  t.after(() => { pool.query = originalQuery; });
  pool.query = async () => ({ rows: [] });
  assert.equal(await getSpaceAccess('user-a', 'space-a'), null);
});

test('booking owner retains access without a group membership', async (t) => {
  const originalQuery = pool.query;
  t.after(() => { pool.query = originalQuery; });
  pool.query = async () => ({
    rows: [{ user_id: 'user-a', can_read: false, can_write: false }],
  });
  assert.deepEqual(await getBookingAccess('user-a', 'booking-a'), {
    isOwner: true,
    canRead: true,
    canWrite: true,
  });
});

test('viewer can read but cannot return another user booking', async (t) => {
  const originalQuery = pool.query;
  t.after(() => { pool.query = originalQuery; });
  pool.query = async () => ({
    rows: [{ user_id: 'user-b', can_read: true, can_write: false }],
  });
  assert.deepEqual(await getBookingAccess('user-a', 'booking-a'), {
    isOwner: false,
    canRead: true,
    canWrite: false,
  });
});
