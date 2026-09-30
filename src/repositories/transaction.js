const { getPool } = require('../config/db');

/**
 * Ejecuta work(connection) dentro de una transaccion.
 * Hace commit si work resuelve; rollback y relanza el error si falla.
 * La conexion siempre se devuelve al pool.
 */
async function withTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { withTransaction };
