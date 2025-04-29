const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const { parseJournalEntry } = require('./parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// SQLite setup
const db = new sqlite3.Database('./db.sqlite');
db.run(`CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  data TEXT,
  images TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS fasting_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  start_time TEXT,
  end_time TEXT
)`);

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/entries', upload.array('images'), async (req, res) => {
  const { date, journal } = req.body;
  const parsedData = parseJournalEntry(journal);
  const imagePaths = req.files.map(file => `/uploads/${file.filename}`).join(',');

  db.run('INSERT INTO entries (date, data, images) VALUES (?, ?, ?)',
    [date, JSON.stringify(parsedData), imagePaths],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      if (parsedData.fasting.start && parsedData.fasting.end) {
        db.run('INSERT INTO fasting_history (date, start_time, end_time) VALUES (?, ?, ?)',
          [date, parsedData.fasting.start, parsedData.fasting.end],
          (err) => {
            if (err) console.error(err);
            res.json({ success: true, data: parsedData });
          });
      } else {
        res.json({ success: true, data: parsedData });
      }
    });
});

app.get('/api/entries/:date', (req, res) => {
  const { date } = req.params;
  db.get('SELECT * FROM entries WHERE date = ?', [date], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT * FROM fasting_history WHERE date = ?', [date], (err, fastingRow) => {
      if (err) return res.status(500).json({ error: err.message });

      const entryData = row ? { ...JSON.parse(row.data), images: row.images.split(',') } : {};
      entryData.fasting = fastingRow ? { start: fastingRow.start_time, end: fastingRow.end_time } : entryData.fasting || {};
      res.json(entryData);
    });
  });
});

app.post('/api/fasting/:date', (req, res) => {
  const { date } = req.params;
  const { start, end } = req.body;

  db.run('INSERT OR REPLACE INTO fasting_history (date, start_time, end_time) VALUES (?, ?, ?)',
    [date, start, end],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.listen(5000, () => console.log('Server running on port 5000'));