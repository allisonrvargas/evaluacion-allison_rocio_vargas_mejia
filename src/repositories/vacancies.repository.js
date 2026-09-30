function mapVacancy(row) {
  return {
    id: row.id,
    title: row.title,
    minYearsExperience: row.min_years_experience,
    status: row.status,
  };
}

/**
 * Lee la vacante con bloqueo compartido: otras transacciones pueden leerla,
 * pero no cambiar su estado (p. ej. cerrarla) hasta que esta termine.
 */
async function findByIdForShare(connection, id) {
  const [rows] = await connection.execute(
    `SELECT id, title, min_years_experience, status
       FROM vacancies
      WHERE id = ?
      FOR SHARE`,
    [id],
  );
  return rows.length > 0 ? mapVacancy(rows[0]) : null;
}

module.exports = { findByIdForShare };
