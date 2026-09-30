const express = require('express');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/', routes);

// Siempre al final y en este orden
app.use(notFound);
app.use(errorHandler);

module.exports = app;
