const SOURCES = Object.freeze({
  REFERRAL: 'REFERRAL',
  INTERNAL: 'INTERNAL',
  JOB_BOARD: 'JOB_BOARD',
  OTHER: 'OTHER',
});

const APPLICATION_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  IN_REVIEW: 'IN_REVIEW',
  REJECTED: 'REJECTED',
  HIRED: 'HIRED',
});

const ACTIVE_STATUSES = Object.freeze([
  APPLICATION_STATUS.RECEIVED,
  APPLICATION_STATUS.IN_REVIEW,
]);

const FINAL_STATUSES = Object.freeze([
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.HIRED,
]);

const PRIORITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  TOP: 'TOP',
});

const VACANCY_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

/** Días que debe esperar un candidato REJECTED para volver a postular a la misma vacante. */
const REAPPLY_WAIT_DAYS = 30;

module.exports = {
  SOURCES,
  APPLICATION_STATUS,
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  PRIORITIES,
  VACANCY_STATUS,
  REAPPLY_WAIT_DAYS,
};
