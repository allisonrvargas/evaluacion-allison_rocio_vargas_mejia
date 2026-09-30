const AppError = require('../utils/AppError');

/**
 * Middleware centralizado. Formato de respuesta siempre igual:
 * { "error": { "statusCode": 400, "message": "...", "details": ... } }
 * "details" solo aparece si el AppError lo trae.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let message = 'Error interno del servidor';
  let details;

  if (err instanceof AppError) {
    ({ statusCode, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    // JSON mal formado en el body (lanzado por express.json)
    statusCode = 400;
    message = 'El cuerpo de la petición no es un JSON válido';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'El cuerpo de la petición es demasiado grande';
  } else if (process.env.NODE_ENV !== 'test') {
    // Error inesperado: se registra completo, pero al cliente solo va un mensaje genérico
    console.error(err);
  }

  const body = { error: { statusCode, message } };
  if (details !== undefined) body.error.details = details;

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
