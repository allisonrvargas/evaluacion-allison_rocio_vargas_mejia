const AppError = require('../utils/AppError');
const { SOURCES } = require('../utils/constants');

const ALLOWED_SOURCES = Object.freeze(Object.values(SOURCES));

/**
 * Longitud maxima de cover_letter. La columna es TEXT (65.535 bytes) y utf8mb4
 * usa hasta 4 bytes por caracter, asi que 10.000 caracteres siempre caben.
 * Sin este limite, un texto largo fallaria en MySQL y terminaria en 500.
 */
const COVER_LETTER_MAX_LENGTH = 10000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Valida el body de POST /applications.
 * Devuelve SOLO los campos permitidos; el resto (score, priority, status...) se descarta.
 * Lanza AppError 400 con una entrada en details por cada campo invalido.
 */
function validateCreateApplication(body) {
  if (!isPlainObject(body)) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  const { candidateId, vacancyId, source, coverLetter } = body;
  const details = [];

  // Paso 1: obligatorios y tipos
  for (const [field, value] of [['candidateId', candidateId], ['vacancyId', vacancyId]]) {
    if (value === undefined || value === null) {
      details.push({ field, message: 'Es obligatorio' });
    } else if (!isPositiveInteger(value)) {
      details.push({ field, message: 'Debe ser un entero positivo' });
    }
  }

  if (source === undefined || source === null) {
    details.push({ field: 'source', message: 'Es obligatorio' });
  } else if (typeof source !== 'string') {
    details.push({ field: 'source', message: 'Debe ser un texto' });
  } else if (!ALLOWED_SOURCES.includes(source)) {
    // Paso 2: valores permitidos
    details.push({
      field: 'source',
      message: `Valor no permitido. Valores validos: ${ALLOWED_SOURCES.join(', ')}`,
    });
  }

  // Opcional: null o ausente se guarda como NULL
  if (coverLetter !== undefined && coverLetter !== null) {
    if (typeof coverLetter !== 'string') {
      details.push({ field: 'coverLetter', message: 'Debe ser un texto' });
    } else if (coverLetter.length > COVER_LETTER_MAX_LENGTH) {
      details.push({
        field: 'coverLetter',
        message: `No puede superar ${COVER_LETTER_MAX_LENGTH} caracteres`,
      });
    }
  }

  if (details.length > 0) {
    throw new AppError('Datos de la postulacion invalidos', 400, details);
  }

  return {
    candidateId,
    vacancyId,
    source,
    coverLetter: coverLetter ?? null,
  };
}

module.exports = { validateCreateApplication, COVER_LETTER_MAX_LENGTH };
