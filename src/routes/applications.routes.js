const { Router } = require('express');
const applicationsController = require('../controllers/applications.controller');

const router = Router();

router.post('/', applicationsController.create);

module.exports = router;
