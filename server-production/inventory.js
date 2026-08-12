function inventoryError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapProductUpdate(row) {
  return {
    id: row.id,
    quantity: Number(row.quantity),
    lastModifiedAt: row.last_modified_at,
  };
}

async function decrementProductStock(client, productId, quantity, userId) {
  const result = await client.query(
    `UPDATE products SET
       quantity = quantity - $1,
       last_modified_by = $2,
       last_modified_at = NOW()
     WHERE id = $3 AND quantity >= $1
     RETURNING id, quantity, last_modified_at`,
    [quantity, userId, productId]
  );
  if (result.rowCount !== 1) throw inventoryError(409, 'Nicht genügend Bestand');
  return mapProductUpdate(result.rows[0]);
}

async function incrementProductStock(client, productId, quantity, userId) {
  const result = await client.query(
    `UPDATE products SET
       quantity = quantity + $1,
       last_modified_by = $2,
       last_modified_at = NOW()
     WHERE id = $3
     RETURNING id, quantity, last_modified_at`,
    [quantity, userId, productId]
  );
  if (result.rowCount !== 1) throw inventoryError(409, 'Produkt nicht mehr vorhanden');
  return mapProductUpdate(result.rows[0]);
}

module.exports = { decrementProductStock, incrementProductStock };
