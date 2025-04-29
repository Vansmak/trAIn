const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const { parseJournalEntry } = require('./parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve images

// SQLite setup
const db = new sqlite3.Database('./db.sqlite');
db.run(`CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  data TEXT,
  images TEXT
)`);

// Multer for image uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// API to save journal entry
app.post('/api/entries', upload.array('images'), async (req, res) => {
  const { date, journal } = req.body;
  const parsedData = parseJournalEntry(journal);
  const imagePaths = req.files.map(file => `/uploads/${file.filename}`).join(',');

  db.run('INSERT INTO entries (date, data, images) VALUES (?, ?, ?)',
    [date, JSON.stringify(parsedData), imagePaths],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, data: parsedData });
    });
});

// API to get entries by date
app.get('/api/entries/:date', (req, res) => {
  const { date } = req.params;
  db.get('SELECT * FROM entries WHERE date = ?', [date], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row ? { ...JSON.parse(row.data), images: row.images.split(',') } : {});
  });
});

app.listen(5000, () => console.log('Server running on port 5000'));