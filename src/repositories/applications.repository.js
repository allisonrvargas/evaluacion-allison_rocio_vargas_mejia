const { getPool } = require('../config/db');
const { ACTIVE_STATUSES } = require('../utils/constants');

const COLUMNS = `id, candidate_id, vacancy_id, cover_letter, source, score,
                 priority, status, created_at, status_updated_at`;

function mapApplication(row) {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    vacancyId: row.vacancy_id,
    coverLetter: row.cover_letter,
    source: row.source,
    score: row.score,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    statusUpdatedAt: row.status_updated_at,
  };
}

function mapApplicationWithDetails(row) {
  return {
    ...mapApplication(row),
    candidate: { name: row.candidate_name, email: row.candidate_email },
    vacancy: { title: row.vacancy_title },
  };
}

/** Un "?" por valor, para que IN (...) siga parametrizado. */
function placeholders(values) {
  return values.map(() => '?').join(', ');
}

/** Todas las postulaciones de un candidato a una vacante, la mas reciente primero. */
async function findByCandidateAndVacancy(connection, candidateId, vacancyId) {
  const [rows] = await connection.execute(
    `SELECT ${COLUMNS}
       FROM applications
      WHERE candidate_id = ? AND vacancy_id = ?
      ORDER BY created_at DESC, id DESC`,
    [candidateId, vacancyId],
  );
  return rows.map(mapApplication);
}

/** Postulaciones activas (RECEIVED, IN_REVIEW) del candidato en vacantes distintas de excludedVacancyId. */
async function countActiveInOtherVacancies(connection, candidateId, excludedVacancyId) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM applications
      WHERE candidate_id = ?
        AND vacancy_id <> ?
        AND status IN (${placeholders(ACTIVE_STATUSES)})`,
    [candidateId, excludedVacancyId, ...ACTIVE_STATUSES],
  );
  return Number(rows[0].total);
}

async function create(connection, application) {
  const [result] = await connection.execute(
    `INSERT INTO applications
       (candidate_id, vacancy_id, cover_letter, source, score, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      application.candidateId,
      application.vacancyId,
      application.coverLetter,
      application.source,
      application.score,
      application.priority,
      application.status,
    ],
  );
  return result.insertId;
}

async function findById(connection, id) {
  const [rows] = await connection.execute(
    `SELECT ${COLUMNS} FROM applications WHERE id = ?`,
    [id],
  );
  return rows.length > 0 ? mapApplication(rows[0]) : null;
}

/**
 * Lee la postulacion y bloquea su fila hasta que termine la transaccion,
 * para que dos cambios de estado simultaneos no se pisen.
 */
async function findByIdForUpdate(connection, id) {
  const [rows] = await connection.execute(
    `SELECT ${COLUMNS} FROM applications WHERE id = ? FOR UPDATE`,
    [id],
  );
  return rows.length > 0 ? mapApplication(rows[0]) : null;
}

/** Cambia el estado y registra el momento del cambio. */
async function updateStatus(connection, id, status) {
  await connection.execute(
    `UPDATE applications
        SET status = ?, status_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [status, id],
  );
}

/**
 * Listado con datos del candidato y de la vacante.
 * Filtros opcionales y combinables: { status, vacancyId }.
 * Solo lectura: usa el pool directamente, sin transaccion.
 */
async function findAllWithDetails({ status, vacancyId } = {}) {
  const conditions = [];
  const params = [];

  if (status !== undefined) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (vacancyId !== undefined) {
    conditions.push('a.vacancy_id = ?');
    params.push(vacancyId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await getPool().execute(
    `SELECT a.id, a.candidate_id, a.vacancy_id, a.cover_letter, a.source, a.score,
            a.priority, a.status, a.created_at, a.status_updated_at,
            c.name  AS candidate_name,
            c.email AS candidate_email,
            v.title AS vacancy_title
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN vacancies  v ON v.id = a.vacancy_id
       ${where}
      ORDER BY a.score DESC, a.created_at ASC, a.id ASC`,
    params,
  );
  return rows.map(mapApplicationWithDetails);
}

module.exports = {
  findByCandidateAndVacancy,
  countActiveInOtherVacancies,
  create,
  findById,
  findByIdForUpdate,
  updateStatus,
  findAllWithDetails,
};
