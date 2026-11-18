// Reads the official channel sites for Greek shows that TVmaze doesn't keep up to date,
// and writes the latest episode number (and the weekly slot, when the page states it) to data/greek.json.
import { readFile, writeFile } from 'node:fs/promises';

const SOURCES = [
  {
    key: 'nterti', names: ['Ντέρτι'], tvmaze: 94478, channel: 'ANT1',
    url: 'https://www.antenna.gr/nterti',
    // links look like /watch/<id>/nterti-epeisodio-26 ; skip "sneak-preview" clips
    episodes: html => [...html.matchAll(/\/watch\/[a-z0-9]+\/nterti-epeisodio-(\d{1,4})(?![\d-])/gi)].map(m => ({ s: 1, e: +m[1] }))
  },
  {
    key: 'oi-kores-tis-aretis', names: ['Οι Κόρες της Αρετής'], channel: 'Alpha',
    url: 'https://www.alphatv.gr/series/oi-kores-tis-aretis/',
    // links look like /series/oi-kores-tis-aretis/episode/782339-s1-epeisodio-24/
    episodes: html => [...html.matchAll(/\/episode\/\d+-s(\d{1,2})-epeisodio-(\d{1,4})(?!\d)/gi)].map(m => ({ s: +m[1], e: +m[2] }))
  }
];

const DAYS = { 'ΚΥΡΙΑΚΗ': 0, 'ΔΕΥΤΕΡΑ': 1, 'ΤΡΙΤΗ': 2, 'ΤΕΤΑΡΤΗ': 3, 'ΠΕΜΠΤΗ': 4, 'ΠΑΡΑΣΚΕΥΗ': 5, 'ΣΑΒΒΑΤΟ': 6 };
const up = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function schedule(html) {
  const text = up(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '));
  const names = Object.keys(DAYS).join('|');
  const m = text.match(new RegExp(`(${names})\\s*(?:-|–|ΕΩΣ|ΜΕΧΡΙ)\\s*(${names})\\D{0,20}?(\\d{1,2})[:.](\\d{2})`)) ||
            text.match(new RegExp(`(${names})()\\D{0,20}?(\\d{1,2})[:.](\\d{2})`));
  if (!m) return null;
  const a = DAYS[m[1]], b = m[2] ? DAYS[m[2]] : a, days = [];
  for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; }
  return { days, time: `${m[3].padStart(2, '0')}:${m[4]}` };
}

const file = 'data/greek.json';
let old = { shows: {} };
try { old = JSON.parse(await readFile(file, 'utf8')); } catch {}
const out = { shows: {} };
const now = new Date().toISOString();

for (const src of SOURCES) {
  const prev = old.shows[src.key] || {};
  const rec = { names: src.names, channel: src.channel, url: src.url, seen: prev.seen || {}, latest: prev.latest || null, schedule: prev.schedule || null };
  if (src.tvmaze) rec.tvmaze = src.tvmaze;
  try {
    const r = await fetch(src.url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'accept-language': 'el-GR,el;q=0.9' } });
    const html = await r.text();
    const eps = src.episodes(html);
    for (const x of eps) { const k = `${x.s}-${x.e}`; if (!rec.seen[k]) rec.seen[k] = now; }
    const best = eps.sort((x, y) => y.s - x.s || y.e - x.e)[0];
    if (best && (!rec.latest || best.s > rec.latest.s || (best.s === rec.latest.s && best.e > rec.latest.e))) rec.latest = best;
    const sc = schedule(html); if (sc) rec.schedule = sc;
    console.log(src.key, r.status, 'episodes found:', eps.length, 'latest:', JSON.stringify(rec.latest), 'schedule:', JSON.stringify(rec.schedule));
  } catch (e) { console.log(src.key, 'failed:', e.message); }
  out.shows[src.key] = rec;
}

const keep = JSON.stringify(old.shows), next = JSON.stringify(out.shows);
if (keep !== next) { out.updated = now; await writeFile(file, JSON.stringify(out, null, 1) + '\n'); console.log('changed'); }
else console.log('no change');
