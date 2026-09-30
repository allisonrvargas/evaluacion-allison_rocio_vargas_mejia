jest.mock('../../src/config/db');

const { getPool } = require('../../src/config/db');
const { withTransaction } = require('../../src/repositories/transaction');

function mockConnection() {
  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(connection) });
  return connection;
}

describe('withTransaction', () => {
  it('hace commit, devuelve el resultado y libera la conexion', async () => {
    const connection = mockConnection();

    const result = await withTransaction(async (conn) => {
      expect(conn).toBe(connection);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('hace rollback, relanza el error y libera la conexion', async () => {
    const connection = mockConnection();
    const failure = new Error('fallo');

    await expect(withTransaction(async () => { throw failure; })).rejects.toBe(failure);

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
