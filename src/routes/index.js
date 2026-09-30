const { Router } = require('express');
const applicationsRoutes = require('./applications.routes');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/applications', applicationsRoutes);

// Se montaran aqui a medida que se implementen:
// router.use('/candidates', require('./candidates.routes'));
// router.use('/vacancies', require('./vacancies.routes'));

module.exports = router;
