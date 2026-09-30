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

module.exports = {
  findByCandidateAndVacancy,
  countActiveInOtherVacancies,
  create,
  findById,
};
