'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const { scrapeGoogle, toCSV, toXML } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Serve static files from public/ ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── API: POST /api/search ─────────────────────────────────────────────────────
// Body: { query: string }
// Returns: JSON with results
app.post('/api/search', async (req, res) => {
  const query = (req.body && req.body.query || '').trim();

  if (!query) {
    return res.status(400).json({ error: 'Zadejte klíčové slovní spojení.' });
  }

  try {
    const data = await scrapeGoogle(query);

    if (data.totalResults === 0) {
      return res.status(422).json({
        error:
          'Google nevrátil žádné přirozené výsledky. ' +
          'Zkuste jiný dotaz nebo zkuste znovu za chvíli (anti-bot ochrana).',
        data,
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('[search error]', err.message);
    return res.status(500).json({ error: 'Chyba při načítání výsledků: ' + err.message });
  }
});

// ── API: POST /api/export ─────────────────────────────────────────────────────
// Body: { data: object, format: 'json' | 'csv' | 'xml' }
// Returns: file download
app.post('/api/export', (req, res) => {
  const { data, format } = req.body || {};

  if (!data || !data.results) {
    return res.status(400).json({ error: 'Žádná data k exportu.' });
  }

  const safeQuery = (data.query || 'results')
    .replace(/[^a-z0-9]/gi, '_')
    .substring(0, 50);

  switch ((format || 'json').toLowerCase()) {
    case 'json': {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeQuery}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }
    case 'csv': {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeQuery}.csv"`);
      return res.send(toCSV(data));
    }
    case 'xml': {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeQuery}.xml"`);
      return res.send(toXML(data));
    }
    default:
      return res.status(400).json({ error: 'Nepodporovaný formát: ' + format });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Google SERP Scraper running → http://localhost:${PORT}`);
  });

  const shutdown = () => {
    console.log('\nShutting down…');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app; // exported for testing
