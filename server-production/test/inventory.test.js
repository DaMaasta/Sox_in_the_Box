const test = require('node:test');
const assert = require('node:assert/strict');
const { decrementProductStock, incrementProductStock } = require('../inventory');

test('stock decrement is atomic and returns the authoritative quantity', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ id: 'product-1', quantity: '0', last_modified_at: '2026-08-12T15:00:00.000Z' }],
      };
    },
  };

  const update = await decrementProductStock(client, 'product-1', 1, 'user-1');

  assert.equal(update.quantity, 0);
  assert.match(calls[0].sql, /quantity >= \$1/);
  assert.deepEqual(calls[0].params, [1, 'user-1', 'product-1']);
});

test('stock decrement rejects a second booking when nothing is available', async () => {
  const client = { query: async () => ({ rowCount: 0, rows: [] }) };

  await assert.rejects(
    decrementProductStock(client, 'product-1', 1, 'user-2'),
    (err) => err.status === 409 && err.message === 'Nicht genügend Bestand'
  );
});

test('return publishes the restored authoritative quantity', async () => {
  const client = {
    query: async () => ({
      rowCount: 1,
      rows: [{ id: 'product-1', quantity: '3', last_modified_at: '2026-08-12T15:00:00.000Z' }],
    }),
  };

  const update = await incrementProductStock(client, 'product-1', 2, 'user-1');
  assert.equal(update.quantity, 3);
});
