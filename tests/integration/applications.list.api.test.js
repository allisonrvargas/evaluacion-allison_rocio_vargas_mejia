const request = require('supertest');

jest.mock('../../src/repositories/applications.repository');

const app = require('../../src/app');
const applicationsRepository = require('../../src/repositories/applications.repository');

const row = {
  id: 3,
  candidateId: 3,
  vacancyId: 1,
  coverLetter: 'Construyo APIs REST con Node.js',
  source: 'REFERRAL',
  score: 9,
  priority: 'TOP',
  status: 'RECEIVED',
  createdAt: new Date('2026-09-25T10:00:00.000Z'),
  statusUpdatedAt: new Date('2026-09-25T10:00:00.000Z'),
  candidate: { name: 'Lucia Herrera', email: 'lucia.herrera@example.com' },
  vacancy: { title: 'Backend Developer Node.js' },
};

beforeEach(() => {
  applicationsRepository.findAllWithDetails.mockResolvedValue([row]);
});

describe('GET /applications', () => {
  it('sin filtros responde 200 con un array', async () => {
    const res = await request(app).get('/applications');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      id: 3,
      score: 9,
      candidate: { name: 'Lucia Herrera', email: 'lucia.herrera@example.com' },
      vacancy: { title: 'Backend Developer Node.js' },
      createdAt: '2026-09-25T10:00:00.000Z',
    });
    expect(applicationsRepository.findAllWithDetails).toHaveBeenCalledWith({});
  });

  it('lista vacia responde 200 con []', async () => {
    applicationsRepository.findAllWithDetails.mockResolvedValue([]);

    const res = await request(app).get('/applications');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('filtros combinados se pasan convertidos al repositorio', async () => {
    const res = await request(app).get('/applications?status=IN_REVIEW&vacancyId=5');

    expect(res.status).toBe(200);
    expect(applicationsRepository.findAllWithDetails)
      .toHaveBeenCalledWith({ status: 'IN_REVIEW', vacancyId: 5 });
  });

  it('parametros desconocidos se ignoran', async () => {
    await request(app).get('/applications?foo=bar&vacancyId=2');

    expect(applicationsRepository.findAllWithDetails).toHaveBeenCalledWith({ vacancyId: 2 });
  });

  it.each([
    ['status=ACTIVE', 'status'],
    ['status=received', 'status'],
    ['status=', 'status'],
    ['status=RECEIVED&status=IN_REVIEW', 'status'],
    ['vacancyId=abc', 'vacancyId'],
    ['vacancyId=0', 'vacancyId'],
    ['vacancyId=-1', 'vacancyId'],
    ['vacancyId=1.5', 'vacancyId'],
    ['vacancyId=01', 'vacancyId'],
    ['vacancyId=99999999999999999999', 'vacancyId'],
  ])('?%s responde 400', async (query, field) => {
    const res = await request(app).get(`/applications?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field })]);
    expect(applicationsRepository.findAllWithDetails).not.toHaveBeenCalled();
  });

  it('ambos filtros invalidos se reportan juntos', async () => {
    const res = await request(app).get('/applications?status=X&vacancyId=Y');

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['status', 'vacancyId']);
  });
});
