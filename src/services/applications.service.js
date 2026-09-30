const AppError = require('../utils/AppError');
const {
  APPLICATION_STATUS,
  VACANCY_STATUS,
  REAPPLY_WAIT_DAYS,
} = require('../utils/constants');
const { calculateScore, getPriority } = require('./scoring.service');
const { withTransaction } = require('../repositories/transaction');
const candidatesRepository = require('../repositories/candidates.repository');
const vacanciesRepository = require('../repositories/vacancies.repository');
const applicationsRepository = require('../repositories/applications.repository');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Regla de duplicidad (funcion pura, sin BD).
 * - Cualquier postulacion RECEIVED, IN_REVIEW o HIRED a la vacante bloquea una nueva.
 * - Si todas son REJECTED, el candidato debe esperar REAPPLY_WAIT_DAYS
 *   desde el status_updated_at mas reciente.
 * Lanza AppError 409 si el candidato no puede postularse.
 */
function assertCanApply(existingApplications, now) {
  const blocking = existingApplications.find(
    (application) => application.status !== APPLICATION_STATUS.REJECTED,
  );

  if (blocking) {
    const message = blocking.status === APPLICATION_STATUS.HIRED
      ? 'El candidato ya fue contratado para esta vacante'
      : `El candidato ya tiene una postulacion activa en esta vacante (estado ${blocking.status})`;
    throw new AppError(message, 409, {
      existingApplicationId: blocking.id,
      status: blocking.status,
    });
  }

  if (existingApplications.length === 0) return;

  const lastRejectedAt = new Date(
    Math.max(...existingApplications.map((a) => new Date(a.statusUpdatedAt).getTime())),
  );
  const reapplyAvailableAt = addDays(lastRejectedAt, REAPPLY_WAIT_DAYS);

  if (now < reapplyAvailableAt) {
    const isoDate = reapplyAvailableAt.toISOString();
    throw new AppError(
      `El candidato fue rechazado en esta vacante. Puede volver a postularse a partir del ${isoDate} (UTC)`,
      409,
      { reapplyAvailableAt: isoDate },
    );
  }
}

/**
 * Crea una postulacion. Espera el input ya validado por el validator.
 * @param {{candidateId:number, vacancyId:number, source:string, coverLetter:string|null}} input
 */
async function createApplication(input, { now = () => new Date() } = {}) {
  const { candidateId, vacancyId, source, coverLetter } = input;

  return withTransaction(async (connection) => {
    // Paso 3: el candidato existe (y su fila queda bloqueada hasta commit/rollback)
    const candidate = await candidatesRepository.findByIdForUpdate(connection, candidateId);
    if (!candidate) {
      throw new AppError(`Candidato ${candidateId} no encontrado`, 404);
    }

    // Paso 4: la vacante existe y esta OPEN
    const vacancy = await vacanciesRepository.findByIdForShare(connection, vacancyId);
    if (!vacancy) {
      throw new AppError(`Vacante ${vacancyId} no encontrada`, 404);
    }
    if (vacancy.status !== VACANCY_STATUS.OPEN) {
      throw new AppError(`La vacante ${vacancyId} esta cerrada`, 409);
    }

    // Paso 5: duplicados y espera tras un rechazo
    const existing = await applicationsRepository.findByCandidateAndVacancy(
      connection,
      candidateId,
      vacancyId,
    );
    assertCanApply(existing, now());

    // Paso 6: postulaciones activas en OTRAS vacantes
    const activeApplicationsInOtherVacancies =
      await applicationsRepository.countActiveInOtherVacancies(connection, candidateId, vacancyId);

    // Paso 7: puntaje y prioridad (los datos ya estan validados)
    const score = calculateScore({
      candidateYears: candidate.yearsExperience,
      requiredYears: vacancy.minYearsExperience,
      source,
      coverLetter,
      activeApplicationsInOtherVacancies,
    });
    const priority = getPriority(score);

    // Paso 8: insertar, siempre como RECEIVED
    const id = await applicationsRepository.create(connection, {
      candidateId,
      vacancyId,
      coverLetter,
      source,
      score,
      priority,
      status: APPLICATION_STATUS.RECEIVED,
    });

    // Se relee para devolver las fechas generadas por MySQL
    return applicationsRepository.findById(connection, id);
  });
}

module.exports = { createApplication, assertCanApply };
