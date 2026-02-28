'use strict';

/**
 * Google SERP Scraper – Serper.dev API
 * Env: SERPER_API_KEY
 */

async function scrapeGoogle(query, options = {}) {
  if (options.html) return parseResults(options.html, query);

  const apiKey = process.env.SERPER_API_KEY || 'e51d75e9d4ed9b003a7517897aad99ea47df9660';
  if (!apiKey) throw new Error('Chybí SERPER_API_KEY. Nastavte v .env (viz README).');

  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'cz', hl: 'cs', num: 10 }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Serper API ${resp.status}: ${body.substring(0, 200)}`);
  }

  const json = await resp.json();
  const organic = json.organic || [];

  return {
    query,
    fetchedAt: new Date().toISOString(),
    totalResults: organic.length,
    results: organic.map((item, i) => ({
      position: i + 1,
      title: item.title || '',
      url: item.link || '',
      displayUrl: item.link ? new URL(item.link).hostname : '',
      snippet: item.snippet || '',
    })),
  };
}

// -- HTML parser (unit tests) --

function parseResults(html, query = '') {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const $a = $(el);
    const href = ($a.attr('href') || '').trim();
    if (!href.startsWith('http') || /google\.(com|cz|[a-z]{2,3})/.test(href) || seen.has(href)) return;

    const $h3 = $a.find('h3').first();
    if (!$h3.length) return;
    const title = $h3.text().trim();
    if (!title) return;

    let $block = $a.parent();
    for (let i = 0; i < 8; i++) {
      const p = $block.parent();
      if (!p || !p.length || p.is('body') || p.is('html')) break;
      $block = p;
      if ($block.find('cite').length || $block.find('.VwiC3b').length) break;
    }

    if ($block.find('[data-text-ad]').length || $block.attr('id') === 'tads') return;

    const displayUrl = $block.find('cite').first().text().trim() ||
      (() => { try { return new URL(href).hostname; } catch { return href; } })();

    let snippet = '';
    for (const sel of ['.VwiC3b', '[data-sncf]']) {
      snippet = $block.find(sel).first().text().trim();
      if (snippet) break;
    }

    seen.add(href);
    results.push({ position: results.length + 1, title, url: href, displayUrl, snippet });
  });

  return { query, fetchedAt: new Date().toISOString(), totalResults: results.length, results };
}

// -- Export helpers --

function toCSV(data) {
  const header = ['position', 'title', 'url', 'displayUrl', 'snippet'];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = data.results.map((r) => header.map((k) => esc(r[k])).join(','));
  return [header.join(','), ...rows].join('\r\n');
}

function toXML(data) {
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = data.results.map((r) =>
    `  <result position="${r.position}">\n    <title>${esc(r.title)}</title>\n    <url>${esc(r.url)}</url>\n    <displayUrl>${esc(r.displayUrl)}</displayUrl>\n    <snippet>${esc(r.snippet)}</snippet>\n  </result>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<searchResults query="${esc(data.query)}" fetchedAt="${esc(data.fetchedAt)}" totalResults="${data.totalResults}">\n${items}\n</searchResults>`;
}

module.exports = { scrapeGoogle, parseResults, toCSV, toXML };
