const app = require('./app');
const { getServerPort } = require('./config/env');
const { checkConnection, closePool } = require('./config/db');

async function start() {
  try {
    await checkConnection();
    console.log('Conexión a MySQL establecida');
  } catch (err) {
    console.error('No se pudo iniciar la conexión a MySQL:', err.message);
    process.exit(1);
  }

  const port = getServerPort();
  const server = app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} recibido, cerrando servidor...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
