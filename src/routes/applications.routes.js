const { Router } = require('express');
const applicationsController = require('../controllers/applications.controller');

const router = Router();

router.get('/', applicationsController.list);
router.post('/', applicationsController.create);
router.put('/:id/status', applicationsController.updateStatus);

module.exports = router;
