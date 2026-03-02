# c ++Gůgl — Google SERP Scraper

Praktický test pro mozna.inizio.cz — Roman Kaco

> Tento projekt jsem dostal jako zadání (úkol) v rámci výběrového řízení.

## Spuštění

```bash
npm install
npm start   # http://localhost:3000
```

> **Serper API klíč je již zabudovaný** — není potřeba nic nastavovat. Aplikace funguje okamžitě po `npm install`.

## Docker

```bash
docker compose up --build
```

## Testy

```bash
npm test   # 30 testů, ~0.6 s
```

---

## Stack a důvody volby

### Node.js 20 + Express

Jednoduchý, rychlý HTTP server bez zbytečné komplexity. Express stačí na pár endpointů (`/api/search`, `/api/export`) a statické soubory — není důvod sahat po Fastify nebo NestJS.

### Serper.dev API — proč ne přímý Google?

Původní záměr byl scrapovat Google přímo přes HTTP požadavky (axios + cheerio). Google ale velmi agresivně blokuje automatizované požadavky — IP dostala CAPTCHA challenge prakticky okamžitě.

Druhý pokus byl Puppeteer (headless Chrome) se stealth pluginem, simulací lidského psaní a ošetřením consent stránek. I to Google zablokoval na úrovni IP.

Třetí pokus byl **Google Custom Search JSON API** (oficiální cesta). API bylo aktivované, klíč vygenerovaný — přesto vracelo `403 Forbidden` s hláškou _"project does not have access"_. Příčina: Google vyžaduje zapnutou fakturaci i pro bezplatný tier (100 dotazů/den), což je zbytečná bariéra pro testovací projekt.

**Serper.dev** řeší všechny tři problémy najednou:

- Vrací strukturované výsledky přímo z Google (organické výsledky, Knowledge Graph, atd.)
- 2 500 bezplatných dotazů/měsíc, bez zadávání platební karty
- Jednoduché REST API — jeden POST request, JSON odpověď

### Cheerio

Používá se **pouze v unit testech** — `parseResults()` parsuje injektované HTML fixtures, aby testy nebyly závislé na síti. V produkční cestě se Cheerio vůbec nevolá.

### dotenv

Načítání `SERPER_API_KEY` z `.env` souboru (volitelné přepsání). API klíč je již natvrdo zabudovaný jako fallback v `scraper.js`, takže aplikace funguje i bez `.env`.

### Jest

30 unit testů pokrývá:

- parsování HTML výsledků (`parseResults`)
- export do CSV (`toCSV`) včetně escapování speciálních znaků
- export do XML (`toXML`) včetně XML entit
- chování `scrapeGoogle()` s injektovaným HTML

### Docker + Docker Compose

Minimalistický `node:20-alpine` obraz (~180 MB). Compose předává `SERPER_API_KEY` z hostitelského prostředí do kontejneru přes environment proměnnou.

### Frontend — čisté CSS, žádný framework

Původně Tailwind CSS, ale pro jednoduchý SPA o dvou stavech (landing / výsledky) je inline CSS přímočařejší a není potřeba build step. Design je záměrně Google-like (stejná typografie, barvy, rozložení), jen přejmenovaný na **Gůgl**.

---

## Struktura projektu

```
src/
  scraper.js      — scrapeGoogle(), toCSV(), toXML(), parseResults()
  server.js       — Express server, /api/search, /api/export
  public/
    index.html    — SPA frontend

tests/
  scraper.test.js — 30 unit testů

Dockerfile
docker-compose.yml
.env              — volitelné přepsání SERPER_API_KEY (není v Gitu, klíč je zabudovaný)
```
