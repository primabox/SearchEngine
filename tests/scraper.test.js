'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for scraper.js
 *
 * Coverage:
 *   1. parseResults() – core HTML → data extraction
 *   2. toCSV()        – CSV export correctness
 *   3. toXML()        – XML export correctness / XSS safety
 *   4. scrapeGoogle() – integration with mocked HTTP client
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { parseResults, toCSV, toXML, scrapeGoogle } = require('../src/scraper');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal Google-like HTML result page with the supplied organic results.
 * Each entry: { title, url, displayUrl, snippet }
 */
function buildGoogleHtml(entries = []) {
  const blocks = entries
    .map(
      (e) => `
      <div class="g">
        <div>
          <div class="yuRUbf">
            <a href="${e.url}">
              <h3>${e.title}</h3>
              <div><cite>${e.displayUrl}</cite></div>
            </a>
          </div>
          <div class="VwiC3b">${e.snippet}</div>
        </div>
      </div>`
    )
    .join('\n');

  return `<!DOCTYPE html><html><body><div id="rso">${blocks}</div></body></html>`;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const SAMPLE_ENTRIES = [
  {
    title: 'První výsledek – Nejlepší SEO nástroje',
    url: 'https://example.com/seo-nastroje',
    displayUrl: 'example.com › seo-nastroje',
    snippet: 'Přehled nejlepších nástrojů pro SEO optimalizaci v roce 2026.',
  },
  {
    title: 'Druhý výsledek – SEO průvodce',
    url: 'https://example.org/pruvodce',
    displayUrl: 'example.org › pruvodce',
    snippet: 'Kompletní průvodce SEO pro začátečníky i zkušené specialisty.',
  },
  {
    title: 'Třetí výsledek – Tipy na klíčová slova',
    url: 'https://example.net/klic-slova',
    displayUrl: 'example.net › klic-slova',
    snippet: 'Jak vybrat správná klíčová slova pro váš web.',
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. parseResults()
// ═════════════════════════════════════════════════════════════════════════════

describe('parseResults()', () => {
  let data;

  beforeAll(() => {
    const html = buildGoogleHtml(SAMPLE_ENTRIES);
    data = parseResults(html, 'SEO nástroje');
  });

  test('returns an object with the expected top-level keys', () => {
    expect(data).toHaveProperty('query');
    expect(data).toHaveProperty('fetchedAt');
    expect(data).toHaveProperty('totalResults');
    expect(data).toHaveProperty('results');
  });

  test('query is preserved correctly', () => {
    expect(data.query).toBe('SEO nástroje');
  });

  test('fetchedAt is a valid ISO-8601 date string', () => {
    expect(() => new Date(data.fetchedAt)).not.toThrow();
    expect(new Date(data.fetchedAt).toISOString()).toBe(data.fetchedAt);
  });

  test('totalResults matches the number of results in the array', () => {
    expect(data.totalResults).toBe(data.results.length);
  });

  test('extracts the correct number of organic results', () => {
    expect(data.results).toHaveLength(SAMPLE_ENTRIES.length);
  });

  test('each result has required fields', () => {
    data.results.forEach((r) => {
      expect(r).toHaveProperty('position');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('url');
      expect(r).toHaveProperty('displayUrl');
      expect(r).toHaveProperty('snippet');
    });
  });

  test('positions are sequential starting at 1', () => {
    data.results.forEach((r, i) => {
      expect(r.position).toBe(i + 1);
    });
  });

  test('titles match the source data', () => {
    SAMPLE_ENTRIES.forEach((entry, i) => {
      expect(data.results[i].title).toBe(entry.title);
    });
  });

  test('URLs match the source data and are valid https:// links', () => {
    SAMPLE_ENTRIES.forEach((entry, i) => {
      expect(data.results[i].url).toBe(entry.url);
      expect(data.results[i].url).toMatch(/^https?:\/\//);
    });
  });

  test('snippets match the source data', () => {
    SAMPLE_ENTRIES.forEach((entry, i) => {
      expect(data.results[i].snippet).toBe(entry.snippet);
    });
  });

  test('returns empty results array for empty HTML', () => {
    const empty = parseResults('<html><body></body></html>', 'test');
    expect(empty.results).toHaveLength(0);
    expect(empty.totalResults).toBe(0);
  });

  test('skips results with no external href', () => {
    const html = `<html><body><div id="rso">
      <div class="g"><div><a href="/relative"><h3>No external</h3></a></div></div>
      <div class="g"><div><a href="https://external.com/page"><h3>External</h3></a><div class="VwiC3b">ok</div></div></div>
    </div></body></html>`;
    const result = parseResults(html, 'test');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].url).toBe('https://external.com/page');
  });

  test('result without <h3> is skipped (not included in results)', () => {
    const html = `<html><body><div id="rso">
      <div class="g"><div><a href="https://notitle.com/"><div class="VwiC3b">snippet only, no heading</div></a></div></div>
    </div></body></html>`;
    const result = parseResults(html, 'test');
    // New parser requires <h3> inside <a> to identify organic results;
    // links without a heading are ignored.
    expect(result.results).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. toCSV()
// ═════════════════════════════════════════════════════════════════════════════

describe('toCSV()', () => {
  let data, csv, lines;

  beforeAll(() => {
    data = parseResults(buildGoogleHtml(SAMPLE_ENTRIES), 'csv test');
    csv = toCSV(data);
    lines = csv.split('\r\n');
  });

  test('first line is a properly formatted header row', () => {
    expect(lines[0]).toBe('position,title,url,displayUrl,snippet');
  });

  test('number of data rows equals number of results', () => {
    // lines[0] = header, remaining = data rows (last may be empty)
    const dataLines = lines.slice(1).filter((l) => l.length > 0);
    expect(dataLines).toHaveLength(SAMPLE_ENTRIES.length);
  });

  test('second line contains position 1 data', () => {
    expect(lines[1]).toContain('"1"');
    expect(lines[1]).toContain(SAMPLE_ENTRIES[0].title);
  });

  test('all URLs appear in the CSV', () => {
    SAMPLE_ENTRIES.forEach((e) => {
      expect(csv).toContain(e.url);
    });
  });

  test('double-quotes inside values are escaped as ""', () => {
    const tricky = [
      {
        title: 'He said "hello"',
        url: 'https://tricky.com/',
        displayUrl: 'tricky.com',
        snippet: 'Tricky "snippet".',
      },
    ];
    const d = parseResults(buildGoogleHtml(tricky), 'q');
    const c = toCSV(d);
    // The double-quote should be escaped as ""
    expect(c).toContain('He said ""hello""');
    expect(c).toContain('Tricky ""snippet"".');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. toXML()
// ═════════════════════════════════════════════════════════════════════════════

describe('toXML()', () => {
  let data, xml;

  beforeAll(() => {
    data = parseResults(buildGoogleHtml(SAMPLE_ENTRIES), 'xml test');
    xml = toXML(data);
  });

  test('output starts with an XML declaration', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  test('root element is <searchResults>', () => {
    expect(xml).toContain('<searchResults ');
    expect(xml).toContain('</searchResults>');
  });

  test('root element contains query attribute', () => {
    expect(xml).toContain('query="xml test"');
  });

  test('totalResults attribute matches', () => {
    expect(xml).toContain(`totalResults="${SAMPLE_ENTRIES.length}"`);
  });

  test('each result has a <result> element with a position attribute', () => {
    SAMPLE_ENTRIES.forEach((_, i) => {
      expect(xml).toContain(`<result position="${i + 1}">`);
    });
  });

  test('all titles appear wrapped in <title> tags', () => {
    SAMPLE_ENTRIES.forEach((e) => {
      expect(xml).toContain(`<title>${e.title}</title>`);
    });
  });

  test('all URLs appear wrapped in <url> tags', () => {
    SAMPLE_ENTRIES.forEach((e) => {
      expect(xml).toContain(`<url>${e.url}</url>`);
    });
  });

  test('special XML characters are escaped', () => {
    // Build the data object directly (bypassing parseResults / Cheerio) so we
    // can inject raw `< > & "` characters and verify toXML() escapes them.
    const rawData = {
      query: 'xss & test',
      fetchedAt: new Date().toISOString(),
      totalResults: 1,
      results: [
        {
          position: 1,
          title: '<script>alert("xss")</script>',
          url: 'https://safe.com/?a=1&b=2',
          displayUrl: 'safe.com',
          snippet: 'A & B > C < D "quoted"',
        },
      ],
    };
    const x = toXML(rawData);

    // & in URL and query must be escaped
    expect(x).toContain('&amp;');
    // < and > in title must be escaped
    expect(x).toContain('&lt;script&gt;');
    // " must be escaped
    expect(x).toContain('&quot;');
    // Raw dangerous content must NOT appear unescaped
    expect(x).not.toContain('<script>');
    expect(x).not.toContain('</script>');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. scrapeGoogle() – mocked HTTP client
// ═════════════════════════════════════════════════════════════════════════════

describe('scrapeGoogle() with injected HTML', () => {
  const mockHtml = buildGoogleHtml(SAMPLE_ENTRIES);

  test('returns a valid data structure when given HTML via options', async () => {
    const result = await scrapeGoogle('SEO test', { html: mockHtml });
    expect(result).toHaveProperty('query', 'SEO test');
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('parses injected HTML and returns expected number of results', async () => {
    const result = await scrapeGoogle('SEO test', { html: mockHtml });
    expect(result.results).toHaveLength(SAMPLE_ENTRIES.length);
  });

  test('first result matches fixture data', async () => {
    const result = await scrapeGoogle('first result test', { html: mockHtml });
    expect(result.results[0].title).toBe(SAMPLE_ENTRIES[0].title);
    expect(result.results[0].url).toBe(SAMPLE_ENTRIES[0].url);
  });

  test('query is preserved in output', async () => {
    const result = await scrapeGoogle('node.js hosting', { html: mockHtml });
    expect(result.query).toBe('node.js hosting');
  });
});
