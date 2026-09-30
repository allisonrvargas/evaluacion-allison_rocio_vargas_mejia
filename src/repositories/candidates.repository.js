function mapCandidate(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    yearsExperience: row.years_experience,
  };
}

/**
 * Lee el candidato y bloquea su fila hasta que termine la transaccion.
 * Las postulaciones simultaneas del mismo candidato se serializan aqui,
 * asi la verificacion de duplicados y el conteo de activas no compiten.
 * Debe llamarse con una conexion dentro de una transaccion.
 */
async function findByIdForUpdate(connection, id) {
  const [rows] = await connection.execute(
    `SELECT id, name, email, years_experience
       FROM candidates
      WHERE id = ?
      FOR UPDATE`,
    [id],
  );
  return rows.length > 0 ? mapCandidate(rows[0]) : null;
}

module.exports = { findByIdForUpdate };
