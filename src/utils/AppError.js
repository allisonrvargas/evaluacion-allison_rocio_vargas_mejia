/**
 * Error de negocio "esperado": el mensaje es seguro para mostrar al cliente.
 * Cualquier otro error que llegue al middleware se trata como inesperado (500).
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = AppError;
