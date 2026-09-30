const { calculateScore, getPriority } = require('../../src/services/scoring.service');
const { SOURCES, PRIORITIES } = require('../../src/utils/constants');

// Caso base que suma 0: no cumple experiencia, fuente sin puntos, sin carta, sin penalización
const base = {
  candidateYears: 1,
  requiredYears: 3,
  source: SOURCES.OTHER,
  coverLetter: '',
  activeApplicationsInOtherVacancies: 0,
};
const score = (overrides) => calculateScore({ ...base, ...overrides });

describe('calculateScore', () => {
  it('caso base suma 0', () => {
    expect(score({})).toBe(0);
  });

  describe('experiencia (+4)', () => {
    it.each([
      [3, 3, 4], // exactamente el mínimo
      [5, 3, 4],
      [2, 3, 0],
      [0, 0, 4], // vacante sin requisito
    ])('candidato %i años, requeridos %i => %i', (candidateYears, requiredYears, expected) => {
      expect(score({ candidateYears, requiredYears })).toBe(expected);
    });
  });

  describe('fuente', () => {
    it.each([
      [SOURCES.REFERRAL, 3],
      [SOURCES.INTERNAL, 2],
      [SOURCES.JOB_BOARD, 0],
      [SOURCES.OTHER, 0],
    ])('%s => %i', (source, expected) => {
      expect(score({ source })).toBe(expected);
    });
  });

  describe('palabras clave (+2, una sola vez)', () => {
    it.each(['node', 'SQL', 'Api', 'Trabajo con Node.js', 'Uso MySQL', 'Diseño APIs REST', 'PostgreSQL y NoSQL'])(
      '"%s" suma 2',
      (coverLetter) => expect(score({ coverLetter })).toBe(2),
    );

    it('varias palabras clave suman solo 2', () => {
      expect(score({ coverLetter: 'Node, SQL y API, y más node y sql' })).toBe(2);
    });

    it('sin palabras clave suma 0', () => {
      expect(score({ coverLetter: 'Soy desarrollador frontend con React' })).toBe(0);
    });

    it('limitación conocida de la subcadena: "api" dentro de otra palabra también suma', () => {
      expect(score({ coverLetter: 'Aprendo con rapidez' })).toBe(2);
    });
  });

  describe('longitud de la carta (+1 si > 500)', () => {
    it.each([
      [500, 0],
      [501, 1],
    ])('%i caracteres => %i', (length, expected) => {
      expect(score({ coverLetter: 'x'.repeat(length) })).toBe(expected);
    });

    it('cuenta caracteres reales: 500 emojis no superan el límite', () => {
      // \u{1F600} es el emoji 😀 escrito como código, para que no se corrompa al copiar
      expect(score({ coverLetter: '\u{1F600}'.repeat(500) })).toBe(0);
    });

    it('carta larga con palabra clave suma 3', () => {
      expect(score({ coverLetter: `node ${'x'.repeat(500)}` })).toBe(3);
    });
  });

  describe('carta ausente', () => {
    it.each([null, undefined])('coverLetter %p suma 0 sin fallar', (coverLetter) => {
      expect(score({ coverLetter })).toBe(0);
    });
  });

  describe('penalización por postulaciones activas (-2 si >= 3)', () => {
    const qualifies = { candidateYears: 5, requiredYears: 3 }; // parte de 4 puntos
    it.each([
      [2, 4],
      [3, 2],
      [10, 2],
    ])('%i activas => %i', (activeApplicationsInOtherVacancies, expected) => {
      expect(score({ ...qualifies, activeApplicationsInOtherVacancies })).toBe(expected);
    });

    it('nunca devuelve negativo', () => {
      expect(score({ activeApplicationsInOtherVacancies: 3 })).toBe(0);
    });
  });

  it('combinación máxima: 4 + 3 + 2 + 1 = 10', () => {
    expect(
      score({
        candidateYears: 8,
        requiredYears: 3,
        source: SOURCES.REFERRAL,
        coverLetter: `API REST con Node.js ${'x'.repeat(500)}`,
      }),
    ).toBe(10);
  });

  it('es pura: no modifica el objeto de entrada', () => {
    const input = Object.freeze({ ...base, coverLetter: 'node' });
    expect(calculateScore(input)).toBe(calculateScore(input));
  });

  describe('entradas inválidas', () => {
    it.each([
      [{ candidateYears: -1 }],
      [{ candidateYears: 2.5 }],
      [{ requiredYears: undefined }],
      [{ activeApplicationsInOtherVacancies: '3' }],
      [{ source: 'LINKEDIN' }],
      [{ coverLetter: 123 }],
    ])('%p lanza TypeError', (overrides) => {
      expect(() => score(overrides)).toThrow(TypeError);
    });
  });
});

describe('getPriority', () => {
  it.each([
    [0, PRIORITIES.LOW],
    [2, PRIORITIES.LOW],
    [3, PRIORITIES.MEDIUM],
    [4, PRIORITIES.MEDIUM],
    [5, PRIORITIES.HIGH],
    [6, PRIORITIES.HIGH],
    [7, PRIORITIES.TOP],
    [10, PRIORITIES.TOP],
  ])('%i => %s', (value, expected) => {
    expect(getPriority(value)).toBe(expected);
  });

  it.each([-1, 3.5, NaN, '5', null])('%p lanza TypeError', (value) => {
    expect(() => getPriority(value)).toThrow(TypeError);
  });
});