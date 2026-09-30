const AppError = require('../utils/AppError');
const { SOURCES, APPLICATION_STATUS } = require('../utils/constants');

const ALLOWED_SOURCES = Object.freeze(Object.values(SOURCES));
const ALLOWED_STATUSES = Object.freeze(Object.values(APPLICATION_STATUS));

/**
 * Longitud maxima de cover_letter. La columna es TEXT (65.535 bytes) y utf8mb4
 * usa hasta 4 bytes por caracter, asi que 10.000 caracteres siempre caben.
 * Sin este limite, un texto largo fallaria en MySQL y terminaria en 500.
 */
const COVER_LETTER_MAX_LENGTH = 10000;

/** Entero positivo escrito en decimal, sin signo, ceros a la izquierda ni decimales. */
const POSITIVE_INTEGER_STRING = /^[1-9][0-9]*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/** Convierte un texto de URL (param o query) a entero positivo, o devuelve null. */
function parsePositiveIntegerString(value) {
  if (typeof value !== 'string' || !POSITIVE_INTEGER_STRING.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function throwIfDetails(details, message) {
  if (details.length > 0) {
    throw new AppError(message, 400, details);
  }
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

  throwIfDetails(details, 'Datos de la postulacion invalidos');

  return {
    candidateId,
    vacancyId,
    source,
    coverLetter: coverLetter ?? null,
  };
}

/**
 * Valida los filtros de GET /applications (?status= y ?vacancyId=).
 * Ambos son opcionales; si vienen, deben ser validos. Otros parametros se ignoran.
 * Un parametro repetido (?status=A&status=B) llega como array y se rechaza.
 */
function validateListFilters(query = {}) {
  const details = [];
  const filters = {};

  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || !ALLOWED_STATUSES.includes(query.status)) {
      details.push({
        field: 'status',
        message: `Valor no permitido. Valores validos: ${ALLOWED_STATUSES.join(', ')}`,
      });
    } else {
      filters.status = query.status;
    }
  }

  if (query.vacancyId !== undefined) {
    const vacancyId = parsePositiveIntegerString(query.vacancyId);
    if (vacancyId === null) {
      details.push({ field: 'vacancyId', message: 'Debe ser un entero positivo' });
    } else {
      filters.vacancyId = vacancyId;
    }
  }

  throwIfDetails(details, 'Filtros invalidos');
  return filters;
}

/** Valida el :id de la URL y lo devuelve como numero. */
function validateApplicationId(rawId) {
  const id = parsePositiveIntegerString(rawId);
  if (id === null) {
    throw new AppError('Id de postulacion invalido', 400, [
      { field: 'id', message: 'Debe ser un entero positivo' },
    ]);
  }
  return id;
}

/** Valida el body de PUT /applications/:id/status. */
function validateStatusUpdate(body) {
  if (!isPlainObject(body)) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  const { status } = body;
  const details = [];

  if (status === undefined || status === null) {
    details.push({ field: 'status', message: 'Es obligatorio' });
  } else if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status)) {
    details.push({
      field: 'status',
      message: `Valor no permitido. Valores validos: ${ALLOWED_STATUSES.join(', ')}`,
    });
  }

  throwIfDetails(details, 'Estado invalido');
  return { status };
}

module.exports = {
  validateCreateApplication,
  validateListFilters,
  validateApplicationId,
  validateStatusUpdate,
  COVER_LETTER_MAX_LENGTH,
};
