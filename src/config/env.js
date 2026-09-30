const path = require('path');
const dotenv = require('dotenv');

// quiet: evita el log informativo que dotenv imprime por defecto desde la v17
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const REQUIRED_DB_VARS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'];

function toPort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Puerto inválido: "${value}"`);
  }
  return port;
}

/**
 * Valida y devuelve la configuración de la base de datos.
 * Se llama bajo demanda (al crear el pool), no al importar el módulo,
 * para que los tests puedan cargar app.js sin un .env completo.
 */
function getDbConfig() {
  const missing = REQUIRED_DB_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }

  return {
    host: process.env.DB_HOST,
    port: toPort(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '', // puede estar vacía en desarrollo local
    database: process.env.DB_NAME,
  };
}

function getServerPort() {
  return toPort(process.env.PORT, 3000);
}

module.exports = { getDbConfig, getServerPort };
