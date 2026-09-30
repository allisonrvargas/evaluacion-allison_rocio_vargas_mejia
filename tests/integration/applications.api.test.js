const request = require('supertest');

jest.mock('../../src/repositories/candidates.repository');
jest.mock('../../src/repositories/vacancies.repository');
jest.mock('../../src/repositories/applications.repository');
jest.mock('../../src/repositories/transaction', () => {
  const mockConnection = { id: 'fake-connection' };
  return {
    mockConnection,
    withTransaction: jest.fn((work) => work(mockConnection)),
  };
});

const app = require('../../src/app');
const candidatesRepository = require('../../src/repositories/candidates.repository');
const vacanciesRepository = require('../../src/repositories/vacancies.repository');
const applicationsRepository = require('../../src/repositories/applications.repository');
const { withTransaction, mockConnection } = require('../../src/repositories/transaction');

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

const candidate = { id: 1, name: 'Ana', email: 'ana@example.com', yearsExperience: 5 };
const openVacancy = { id: 10, title: 'Backend', minYearsExperience: 3, status: 'OPEN' };

const validBody = {
  candidateId: 1,
  vacancyId: 10,
  source: 'REFERRAL',
  coverLetter: 'Experiencia con Node.js y MySQL',
};

const post = (body) => request(app).post('/applications').send(body);

beforeEach(() => {
  candidatesRepository.findByIdForUpdate.mockResolvedValue(candidate);
  vacanciesRepository.findByIdForShare.mockResolvedValue(openVacancy);
  applicationsRepository.findByCandidateAndVacancy.mockResolvedValue([]);
  applicationsRepository.countActiveInOtherVacancies.mockResolvedValue(0);
  applicationsRepository.create.mockResolvedValue(99);
  // findById devuelve lo que se inserto, como haria MySQL
  applicationsRepository.findById.mockImplementation(async (connection, id) => {
    const [[, data]] = applicationsRepository.create.mock.calls.slice(-1);
    return {
      id,
      ...data,
      createdAt: new Date('2026-09-30T12:00:00.000Z'),
      statusUpdatedAt: new Date('2026-09-30T12:00:00.000Z'),
    };
  });
});

describe('POST /applications - creacion exitosa', () => {
  it('responde 201 con la postulacion creada, puntaje y prioridad calculados', async () => {
    const res = await post(validBody);

    // 4 (experiencia) + 3 (REFERRAL) + 2 (palabra clave) = 9 => TOP
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/applications/99');
    expect(res.body).toEqual({
      id: 99,
      candidateId: 1,
      vacancyId: 10,
      coverLetter: validBody.coverLetter,
      source: 'REFERRAL',
      score: 9,
      priority: 'TOP',
      status: 'RECEIVED',
      createdAt: '2026-09-30T12:00:00.000Z',
      statusUpdatedAt: '2026-09-30T12:00:00.000Z',
    });
  });

  it('ejecuta todo dentro de una transaccion con la misma conexion', async () => {
    await post(validBody);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(candidatesRepository.findByIdForUpdate).toHaveBeenCalledWith(mockConnection, 1);
    expect(vacanciesRepository.findByIdForShare).toHaveBeenCalledWith(mockConnection, 10);
    expect(applicationsRepository.countActiveInOtherVacancies)
      .toHaveBeenCalledWith(mockConnection, 1, 10);
  });

  it('ignora score, priority y status enviados en el body', async () => {
    const res = await post({ ...validBody, score: 100, priority: 'LOW', status: 'HIRED', id: 5 });

    expect(res.status).toBe(201);
    expect(applicationsRepository.create).toHaveBeenCalledWith(mockConnection, {
      candidateId: 1,
      vacancyId: 10,
      coverLetter: validBody.coverLetter,
      source: 'REFERRAL',
      score: 9,
      priority: 'TOP',
      status: 'RECEIVED',
    });
  });

  it('aplica la penalizacion con 3 postulaciones activas en otras vacantes', async () => {
    applicationsRepository.countActiveInOtherVacancies.mockResolvedValue(3);

    const res = await post(validBody);

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(7);
    expect(res.body.priority).toBe('TOP');
  });

  it('acepta coverLetter ausente y la guarda como null', async () => {
    const { coverLetter, ...withoutLetter } = validBody;

    const res = await post(withoutLetter);

    expect(res.status).toBe(201);
    expect(res.body.coverLetter).toBeNull();
    expect(res.body.score).toBe(7); // 4 + 3
  });
});

describe('POST /applications - validacion (400)', () => {
  const expectNoDbAccess = () => {
    expect(withTransaction).not.toHaveBeenCalled();
    expect(applicationsRepository.create).not.toHaveBeenCalled();
  };

  it('source invalido', async () => {
    const res = await post({ ...validBody, source: 'LINKEDIN' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ field: 'source' }),
    ]);
    expectNoDbAccess();
  });

  it('campos obligatorios ausentes', async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual([
      'candidateId',
      'vacancyId',
      'source',
    ]);
    expectNoDbAccess();
  });

  it.each([
    ['candidateId', '1'],
    ['candidateId', 0],
    ['candidateId', -3],
    ['candidateId', 1.5],
    ['vacancyId', true],
    ['source', 3],
    ['coverLetter', 123],
    ['coverLetter', { texto: 'node' }],
  ])('%s = %p', async (field, value) => {
    const res = await post({ ...validBody, [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ field })]);
    expectNoDbAccess();
  });

  it('coverLetter demasiado larga', async () => {
    const res = await post({ ...validBody, coverLetter: 'x'.repeat(10001) });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('coverLetter');
  });

  it('body que no es un objeto', async () => {
    const res = await post([validBody]);

    expect(res.status).toBe(400);
    expectNoDbAccess();
  });
});

describe('POST /applications - existencia (404)', () => {
  it('candidato inexistente', async () => {
    candidatesRepository.findByIdForUpdate.mockResolvedValue(null);

    const res = await post(validBody);

    expect(res.status).toBe(404);
    expect(vacanciesRepository.findByIdForShare).not.toHaveBeenCalled();
  });

  it('vacante inexistente', async () => {
    vacanciesRepository.findByIdForShare.mockResolvedValue(null);

    const res = await post(validBody);

    expect(res.status).toBe(404);
    expect(applicationsRepository.create).not.toHaveBeenCalled();
  });
});

describe('POST /applications - conflictos (409)', () => {
  it('vacante cerrada', async () => {
    vacanciesRepository.findByIdForShare.mockResolvedValue({ ...openVacancy, status: 'CLOSED' });

    const res = await post(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cerrada/);
    expect(applicationsRepository.create).not.toHaveBeenCalled();
  });

  it.each(['RECEIVED', 'IN_REVIEW', 'HIRED'])('duplicado con postulacion %s', async (status) => {
    applicationsRepository.findByCandidateAndVacancy.mockResolvedValue([
      { id: 7, status, statusUpdatedAt: daysAgo(100) },
    ]);

    const res = await post(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ existingApplicationId: 7, status });
    expect(applicationsRepository.create).not.toHaveBeenCalled();
  });

  it('rechazado hace 10 dias: 409 con la fecha desde la que puede postular', async () => {
    const rejectedAt = daysAgo(10);
    applicationsRepository.findByCandidateAndVacancy.mockResolvedValue([
      { id: 7, status: 'REJECTED', statusUpdatedAt: rejectedAt },
    ]);
    const expectedDate = new Date(rejectedAt.getTime() + 30 * DAY).toISOString();

    const res = await post(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(expectedDate);
    expect(res.body.error.details).toEqual({ reapplyAvailableAt: expectedDate });
    expect(applicationsRepository.create).not.toHaveBeenCalled();
  });

  it('rechazado hace 40 dias: puede volver a postularse (201)', async () => {
    applicationsRepository.findByCandidateAndVacancy.mockResolvedValue([
      { id: 7, status: 'REJECTED', statusUpdatedAt: daysAgo(40) },
    ]);

    const res = await post(validBody);

    expect(res.status).toBe(201);
  });
});

describe('POST /applications - errores inesperados', () => {
  it('un fallo del repositorio responde 500 sin filtrar detalles', async () => {
    applicationsRepository.create.mockRejectedValue(new Error('ER_LOCK_DEADLOCK'));

    const res = await post(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toContain('ER_LOCK_DEADLOCK');
  });
});
