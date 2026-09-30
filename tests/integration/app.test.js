const request = require('supertest');
const express = require('express');
const app = require('../../src/app');
const AppError = require('../../src/utils/AppError');
const errorHandler = require('../../src/middlewares/errorHandler');

describe('app base', () => {
  it('GET /health responde 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('ruta inexistente responde 404 con formato de error', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { statusCode: 404, message: 'Ruta no encontrada: GET /no-existe' },
    });
  });

  it('JSON mal formado responde 400', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"mal": ');
    expect(res.status).toBe(400);
    expect(res.body.error.statusCode).toBe(400);
  });
});

describe('errorHandler', () => {
  const buildApp = (handler) => {
    const testApp = express();
    testApp.get('/boom', handler);
    testApp.use(errorHandler);
    return testApp;
  };

  it('usa statusCode, mensaje y details de AppError', async () => {
    const testApp = buildApp(() => {
      throw new AppError('Vacante cerrada', 409, [{ field: 'vacancyId' }]);
    });
    const res = await request(testApp).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { statusCode: 409, message: 'Vacante cerrada', details: [{ field: 'vacancyId' }] },
    });
  });

  it('errores inesperados (también async) devuelven 500 sin filtrar detalles', async () => {
    const testApp = buildApp(async () => {
      throw new Error('ER_ACCESS_DENIED: credenciales internas');
    });
    const res = await request(testApp).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { statusCode: 500, message: 'Error interno del servidor' },
    });
  });
});
