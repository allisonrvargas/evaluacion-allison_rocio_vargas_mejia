const { validateCreateApplication } = require('../validators/applications.validator');
const applicationsService = require('../services/applications.service');

async function create(req, res) {
  // La validacion ocurre antes del service: un dato invalido nunca llega a calculateScore
  const input = validateCreateApplication(req.body);
  const application = await applicationsService.createApplication(input);

  res.status(201).location(`/applications/${application.id}`).json(application);
}

module.exports = { create };
