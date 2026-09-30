const {
  validateCreateApplication,
  validateListFilters,
  validateApplicationId,
  validateStatusUpdate,
} = require('../validators/applications.validator');
const applicationsService = require('../services/applications.service');

async function create(req, res) {
  // La validacion ocurre antes del service: un dato invalido nunca llega a calculateScore
  const input = validateCreateApplication(req.body);
  const application = await applicationsService.createApplication(input);

  res.status(201).location(`/applications/${application.id}`).json(application);
}

async function list(req, res) {
  const filters = validateListFilters(req.query);
  const applications = await applicationsService.listApplications(filters);

  res.status(200).json(applications);
}

async function updateStatus(req, res) {
  // Id y body se validan antes de consultar la BD
  const id = validateApplicationId(req.params.id);
  const { status } = validateStatusUpdate(req.body);
  const application = await applicationsService.updateApplicationStatus(id, status);

  res.status(200).json(application);
}

module.exports = { create, list, updateStatus };
