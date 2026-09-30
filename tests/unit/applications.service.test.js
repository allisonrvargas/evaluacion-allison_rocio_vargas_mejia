const { assertCanApply } = require('../../src/services/applications.service');
const AppError = require('../../src/utils/AppError');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-30T12:00:00.000Z');
const before = (ms) => new Date(NOW.getTime() - ms);

const rejected = (statusUpdatedAt, id = 1) => ({ id, status: 'REJECTED', statusUpdatedAt });

function expectConflict(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    return err;
  }
  throw new Error('Se esperaba un AppError 409');
}

describe('assertCanApply', () => {
  it('sin postulaciones previas: permitido', () => {
    expect(() => assertCanApply([], NOW)).not.toThrow();
  });

  it.each(['RECEIVED', 'IN_REVIEW', 'HIRED'])('%s bloquea', (status) => {
    expectConflict(() => assertCanApply([{ id: 1, status, statusUpdatedAt: before(365 * DAY) }], NOW));
  });

  it('exactamente 30 dias despues del rechazo: permitido', () => {
    expect(() => assertCanApply([rejected(before(30 * DAY))], NOW)).not.toThrow();
  });

  it('30 dias menos 1 ms: bloqueado, con la fecha exacta', () => {
    const err = expectConflict(() => assertCanApply([rejected(before(30 * DAY - 1))], NOW));
    expect(err.details.reapplyAvailableAt).toBe('2026-09-30T12:00:00.001Z');
  });

  it('usa el rechazo MAS RECIENTE, no el primero de la lista', () => {
    const err = expectConflict(() =>
      assertCanApply([rejected(before(60 * DAY), 1), rejected(before(5 * DAY), 2)], NOW),
    );
    expect(err.details.reapplyAvailableAt).toBe(new Date(NOW.getTime() + 25 * DAY).toISOString());
  });

  it('un HIRED antiguo bloquea aunque haya un rechazo viejo', () => {
    expectConflict(() =>
      assertCanApply([rejected(before(90 * DAY), 1), { id: 2, status: 'HIRED', statusUpdatedAt: before(200 * DAY) }], NOW),
    );
  });
});
