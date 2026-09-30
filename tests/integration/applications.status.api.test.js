const request = require('supertest');

jest.mock('../../src/repositories/applications.repository');
jest.mock('../../src/repositories/transaction', () => {
  const mockConnection = { id: 'fake-connection' };
  return {
    mockConnection,
    withTransaction: jest.fn((work) => work(mockConnection)),
  };
});

const app = require('../../src/app');
const applicationsRepository = require('../../src/repositories/applications.repository');
const { withTransaction, mockConnection } = require('../../src/repositories/transaction');

const created = new Date('2026-09-25T10:00:00.000Z');
const updated = new Date('2026-09-30T15:00:00.000Z');

const application = (status, statusUpdatedAt = created) => ({
  id: 3,
  candidateId: 3,
  vacancyId: 1,
  coverLetter: null,
  source: 'REFERRAL',
  score: 7,
  priority: 'TOP',
  status,
  createdAt: created,
  statusUpdatedAt,
});

const put = (id, body) => request(app).put(`/applications/${id}/status`).send(body);

beforeEach(() => {
  applicationsRepository.findByIdForUpdate.mockResolvedValue(application('RECEIVED'));
  applicationsRepository.updateStatus.mockResolvedValue();
  applicationsRepository.findById.mockResolvedValue(application('IN_REVIEW', updated));
});

describe('PUT /applications/:id/status', () => {
  it('actualiza y responde 200 con la postulacion actualizada', async () => {
    const res = await put(3, { status: 'IN_REVIEW' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 3,
      status: 'IN_REVIEW',
      statusUpdatedAt: updated.toISOString(),
    });
    expect(applicationsRepository.findByIdForUpdate).toHaveBeenCalledWith(mockConnection, 3);
    expect(applicationsRepository.updateStatus).toHaveBeenCalledWith(mockConnection, 3, 'IN_REVIEW');
  });

  it.each(['REJECTED', 'HIRED'])('puede pasar de IN_REVIEW a %s', async (status) => {
    applicationsRepository.findByIdForUpdate.mockResolvedValue(application('IN_REVIEW'));
    applicationsRepository.findById.mockResolvedValue(application(status, updated));

    const res = await put(3, { status });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(status);
  });

  it('mismo estado: 200 sin actualizar ni tocar status_updated_at', async () => {
    const res = await put(3, { status: 'RECEIVED' });

    expect(res.status).toBe(200);
    expect(res.body.statusUpdatedAt).toBe(created.toISOString());
    expect(applicationsRepository.updateStatus).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5', '01'])('id invalido "%s" responde 400', async (id) => {
    const res = await put(id, { status: 'IN_REVIEW' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('id');
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('postulacion inexistente responde 404', async () => {
    applicationsRepository.findByIdForUpdate.mockResolvedValue(null);

    const res = await put(999, { status: 'IN_REVIEW' });

    expect(res.status).toBe(404);
    expect(applicationsRepository.updateStatus).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'ARCHIVED' }],
    [{ status: 'in_review' }],
    [{ status: 1 }],
    [{}],
  ])('body %p responde 400', async (body) => {
    const res = await put(3, body);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('status');
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it.each(['REJECTED', 'HIRED'])('postulacion en estado final %s responde 409', async (finalStatus) => {
    applicationsRepository.findByIdForUpdate.mockResolvedValue(application(finalStatus));

    const res = await put(3, { status: 'IN_REVIEW' });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ currentStatus: finalStatus });
    expect(applicationsRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('estado final con el mismo estado pedido tambien responde 409', async () => {
    applicationsRepository.findByIdForUpdate.mockResolvedValue(application('REJECTED'));

    const res = await put(3, { status: 'REJECTED' });

    expect(res.status).toBe(409);
  });
});
