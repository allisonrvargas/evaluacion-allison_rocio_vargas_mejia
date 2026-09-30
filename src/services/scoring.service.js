const { SOURCES, PRIORITIES } = require('../utils/constants');

// -------------------------------------------------------------
// Configuración de reglas (única fuente de verdad del puntaje)
// -------------------------------------------------------------

const SCORE_POINTS = Object.freeze({
  MEETS_REQUIRED_EXPERIENCE: 4,
  COVER_LETTER_HAS_KEYWORD: 2,
  COVER_LETTER_IS_LONG: 1,
  TOO_MANY_ACTIVE_APPLICATIONS: -2,
});

/** Puntos por fuente. Las fuentes que no aparecen suman 0. */
const SOURCE_POINTS = Object.freeze({
  [SOURCES.REFERRAL]: 3,
  [SOURCES.INTERNAL]: 2,
  [SOURCES.JOB_BOARD]: 0,
  [SOURCES.OTHER]: 0,
});

/**
 * Se buscan como SUBCADENA y sin distinguir mayúsculas, para que cuenten
 * "Node.js", "MySQL" o "APIs". Contrapartida: "api" también aparece en
 * palabras comunes ("rapidez", "capital"); ver test de limitación conocida.
 */
const COVER_LETTER_KEYWORDS = Object.freeze(['node', 'sql', 'api']);

/** La carta suma si su longitud es ESTRICTAMENTE mayor que este valor. */
const LONG_COVER_LETTER_MIN_EXCLUSIVE = 500;

/** Se penaliza si las postulaciones activas en otras vacantes son >= este valor. */
const ACTIVE_APPLICATIONS_PENALTY_THRESHOLD = 3;

const MIN_SCORE = 0;

/** Umbral mínimo (inclusivo) de cada prioridad, ordenados de mayor a menor. */
const PRIORITY_THRESHOLDS = Object.freeze([
  Object.freeze({ minScore: 7, priority: PRIORITIES.TOP }),
  Object.freeze({ minScore: 5, priority: PRIORITIES.HIGH }),
  Object.freeze({ minScore: 3, priority: PRIORITIES.MEDIUM }),
  Object.freeze({ minScore: MIN_SCORE, priority: PRIORITIES.LOW }),
]);

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} debe ser un entero >= 0 (recibido: ${value})`);
  }
}

/** Cuenta caracteres reales (code points), no unidades UTF-16: un emoji cuenta 1. */
function characterCount(text) {
  return Array.from(text).length;
}

function hasKeyword(text) {
  const normalized = text.toLowerCase();
  return COVER_LETTER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// -------------------------------------------------------------
// API pública
// -------------------------------------------------------------

/**
 * Calcula el puntaje de una postulación. Función pura: mismo input, mismo output.
 * @param {object} params
 * @param {number} params.candidateYears
 * @param {number} params.requiredYears
 * @param {string} params.source - Uno de SOURCES
 * @param {string|null|undefined} params.coverLetter - Opcional
 * @param {number} params.activeApplicationsInOtherVacancies
 * @returns {number} Entero >= 0
 */
function calculateScore({
  candidateYears,
  requiredYears,
  source,
  coverLetter,
  activeApplicationsInOtherVacancies,
}) {
  assertNonNegativeInteger(candidateYears, 'candidateYears');
  assertNonNegativeInteger(requiredYears, 'requiredYears');
  assertNonNegativeInteger(activeApplicationsInOtherVacancies, 'activeApplicationsInOtherVacancies');

  if (!Object.hasOwn(SOURCE_POINTS, source)) {
    throw new TypeError(`source inválida: ${source}`);
  }
  if (coverLetter != null && typeof coverLetter !== 'string') {
    throw new TypeError('coverLetter debe ser texto, null o undefined');
  }

  const letter = coverLetter ?? '';
  let score = 0;

  if (candidateYears >= requiredYears) {
    score += SCORE_POINTS.MEETS_REQUIRED_EXPERIENCE;
  }

  score += SOURCE_POINTS[source];

  if (hasKeyword(letter)) {
    score += SCORE_POINTS.COVER_LETTER_HAS_KEYWORD;
  }

  if (characterCount(letter) > LONG_COVER_LETTER_MIN_EXCLUSIVE) {
    score += SCORE_POINTS.COVER_LETTER_IS_LONG;
  }

  if (activeApplicationsInOtherVacancies >= ACTIVE_APPLICATIONS_PENALTY_THRESHOLD) {
    score += SCORE_POINTS.TOO_MANY_ACTIVE_APPLICATIONS;
  }

  return Math.max(score, MIN_SCORE);
}

/**
 * Traduce un puntaje a prioridad: 0-2 LOW, 3-4 MEDIUM, 5-6 HIGH, 7+ TOP.
 * @param {number} score - Entero >= 0
 * @returns {string} Uno de PRIORITIES
 */
function getPriority(score) {
  assertNonNegativeInteger(score, 'score');
  return PRIORITY_THRESHOLDS.find(({ minScore }) => score >= minScore).priority;
}

module.exports = {
  calculateScore,
  getPriority,
  // Exportadas para tests y documentación
  SCORE_POINTS,
  SOURCE_POINTS,
  COVER_LETTER_KEYWORDS,
  LONG_COVER_LETTER_MIN_EXCLUSIVE,
  ACTIVE_APPLICATIONS_PENALTY_THRESHOLD,
  PRIORITY_THRESHOLDS,
};
