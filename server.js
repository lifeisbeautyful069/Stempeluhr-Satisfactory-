const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DIR = process.env.DATA_DIR || __dirname;
const FILE = path.join(DIR, 'data.json');
const PASSWORD = process.env.TEAM_PASSWORD || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Struktur: entries haben { id, user, start, end, breaks: [{ start, end }] }
function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db.entries.forEach(e => { if (!e.breaks) e.breaks = []; });
    return db;
  } catch { return { users: [], entries: [] }; }
}
function save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

app.use('/api', (req, res, next) => {
  if (PASSWORD && req.get('x-team-password') !== PASSWORD) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  next();
});

app.get('/api/data', (req, res) => res.json(load()));

app.post('/api/users', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const db = load();
  if (db.users.includes(name)) return res.status(400).json({ error: 'Name existiert schon' });
  db.users.push(name);
  save(db);
  res.json(db);
});

app.post('/api/clockin', (req, res) => {
  const db = load();
  const user = req.body.user;
  if (!db.users.includes(user)) return res.status(400).json({ error: 'Unbekannter Nutzer' });
  if (db.entries.some(e => e.user === user && !e.end)) {
    return res.status(400).json({ error: 'Schon eingestempelt' });
  }
  db.entries.push({ id: Date.now().toString(36), user, start: Date.now(), end: null, breaks: [] });
  save(db);
  res.json(db);
});

app.post('/api/clockout', (req, res) => {
  const db = load();
  const e = db.entries.find(x => x.user === req.body.user && !x.end);
  if (!e) return res.status(400).json({ error: 'Nicht eingestempelt' });
  const now = Date.now();
  // Laufende Pause wird beim Ausstempeln automatisch beendet
  const openBreak = e.breaks.find(b => !b.end);
  if (openBreak) openBreak.end = now;
  e.end = now;
  save(db);
  res.json(db);
});

app.post('/api/breakstart', (req, res) => {
  const db = load();
  const e = db.entries.find(x => x.user === req.body.user && !x.end);
  if (!e) return res.status(400).json({ error: 'Nicht eingestempelt' });
  if (e.breaks.some(b => !b.end)) return res.status(400).json({ error: 'Pause läuft schon' });
  e.breaks.push({ start: Date.now(), end: null });
  save(db);
  res.json(db);
});

app.post('/api/breakend', (req, res) => {
  const db = load();
  const e = db.entries.find(x => x.user === req.body.user && !x.end);
  const b = e && e.breaks.find(x => !x.end);
  if (!b) return res.status(400).json({ error: 'Keine Pause aktiv' });
  b.end = Date.now();
  save(db);
  res.json(db);
});

app.post('/api/entries', (req, res) => {
  const { user, start, end } = req.body;
  const db = load();
  if (!db.users.includes(user) || !(start < end)) return res.status(400).json({ error: 'Ungültige Eingabe' });
  db.entries.push({ id: Date.now().toString(36), user, start, end, breaks: [] });
  save(db);
  res.json(db);
});

app.delete('/api/entries/:id', (req, res) => {
  const db = load();
  db.entries = db.entries.filter(e => e.id !== req.params.id);
  save(db);
  res.json(db);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Läuft auf Port ' + port));
