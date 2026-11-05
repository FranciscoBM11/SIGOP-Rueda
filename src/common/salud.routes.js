'use strict';

// GET /api/v1/salud — usado por UptimeRobot cada 5 minutos (RNF-05).
// NO consulta la base de datos, para no despertar Azure SQL (Fase 3, sección 7.1).
const { Router } = require('express');

const router = Router();

router.get('/salud', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ estado: 'ok' });
});

module.exports = router;
