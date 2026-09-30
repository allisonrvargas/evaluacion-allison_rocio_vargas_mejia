const mysql = require('mysql2/promise');
const { getDbConfig } = require('./env');

let pool = null;

/**
 * Devuelve el pool compartido, creandolo en el primer uso.
 * La creacion diferida permite importar modulos que dependen de la BD
 * sin abrir conexiones (util en tests con repositorios mockeados).
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...getDbConfig(),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // Los DATETIME se leen y escriben como UTC
      timezone: 'Z',
    });

    // NOW() y CURRENT_TIMESTAMP tambien en UTC, para que las fechas generadas
    // por MySQL y las comparadas en Node usen la misma referencia.
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

/** Verifica que la BD responde; se usa al arrancar el servidor. */
async function checkConnection() {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

/** Cierra el pool (apagado del servidor y teardown de tests). */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, checkConnection, closePool };
