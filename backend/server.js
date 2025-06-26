const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Create directories
const dataDir = './data';
const uploadsDir = './uploads';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Database setup
const db = new sqlite3.Database('./data/health-journal.db');

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date TEXT UNIQUE,
    notes TEXT,
    photos TEXT,
    health_data TEXT,
    timestamp TEXT
  )`);
});

function parseHealthData(entryText) {
  const data = {
    calories: 0,
    exercise: 0,
    weight: null,
    fastingHours: 0
  };

  // Extract calories - handle commas in numbers
  const caloriesMatch = entryText.match(/Total calories:.*?~?([\d,]+)/i);
  if (caloriesMatch) {
    data.calories = parseInt(caloriesMatch[1].replace(/,/g, ''));
  }

  // Extract exercise minutes
  const exerciseMatch = entryText.match(/Exercise:.*?(\d+)\s*min/i);
  if (exerciseMatch) {
    data.exercise = parseInt(exerciseMatch[1]);
  }

  // Extract weight - more flexible patterns
  const weightPatterns = [
    /weighed?\s+in\s+at\s+([\d.]+)/i,           // "weighed in at 185.2"
    /weighed?\s+([\d.]+)/i,                     // "weighed 185.2"
    /weight:?\s*([\d.]+)/i,                     // "weight: 185.2"
    /([\d.]+)\s*lbs?/i                          // "185.2 lbs"
  ];
  
  for (const pattern of weightPatterns) {
    const match = entryText.match(pattern);
    if (match) {
      data.weight = parseFloat(match[1]);
      break;
    }
  }

  // Extract fasting hours
  const fastingMatch = entryText.match(/Fasting window:.*?([\d.]+)\s*hours?/i);
  if (fastingMatch) {
    data.fastingHours = parseFloat(fastingMatch[1]);
  }

  console.log('Parsed data:', data);
  return data;
}
// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Routes

// Get all entries
app.get('/api/entries', (req, res) => {
  db.all('SELECT * FROM entries ORDER BY date DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const entries = {};
    rows.forEach(row => {
      entries[row.date] = {
        notes: row.notes,
        photos: row.photos ? JSON.parse(row.photos) : [],
        healthData: row.health_data ? JSON.parse(row.health_data) : {},
        timestamp: row.timestamp
      };
    });
    
    res.json(entries);
  });
});

// Get single entry
app.get('/api/entries/:date', (req, res) => {
  const date = req.params.date;
  
  db.get('SELECT * FROM entries WHERE date = ?', [date], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    
    const entry = {
      notes: row.notes,
      photos: row.photos ? JSON.parse(row.photos) : [],
      healthData: row.health_data ? JSON.parse(row.health_data) : {},
      timestamp: row.timestamp
    };
    
    res.json(entry);
  });
});

// Save/update entry
app.post('/api/entries/:date', (req, res) => {
  const date = req.params.date;
  const { notes, photos } = req.body;
  
  if (!notes && (!photos || photos.length === 0)) {
    // Delete entry if empty
    db.run('DELETE FROM entries WHERE date = ?', [date], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: 'Entry deleted' });
    });
    return;
  }
  
  const healthData = parseHealthData(notes || '');
  const timestamp = new Date().toISOString();
  const id = uuidv4();
  
  db.run(
    `INSERT OR REPLACE INTO entries (id, date, notes, photos, health_data, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, date, notes, JSON.stringify(photos || []), JSON.stringify(healthData), timestamp],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        message: 'Entry saved',
        entry: {
          notes,
          photos: photos || [],
          healthData,
          timestamp
        }
      });
    }
  );
});

// Weekly summary
app.get('/api/summary/week/:date', (req, res) => {
  const date = new Date(req.params.date);
  const dayOfWeek = date.getDay(); // Sunday = 0, Monday = 1, etc.
  
  // Calculate Monday as start of week
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days, else go back (dayOfWeek - 1)
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - daysToSubtract);
  
  // End of week is Sunday (6 days after Monday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = endOfWeek.toISOString().split('T')[0];
  
  console.log('Week calculation (Monday-Sunday):');
  console.log('Input date:', req.params.date);
  console.log('Start of week (Monday):', startDate);
  console.log('End of week (Sunday):', endDate);
  
  db.all(
    'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date',
    [startDate, endDate],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log('Found rows:', rows.length);
      
      const healthData = rows
        .map(row => row.health_data ? JSON.parse(row.health_data) : null)
        .filter(data => data);
      
      if (healthData.length === 0) {
        res.json({
          avgCalories: 0,
          totalExercise: 0,
          avgFasting: 0,
          weightChange: null,
          currentWeight: null,
          daysTracked: 0
        });
        return;
      }
      
      const avgCalories = Math.round(
        healthData.reduce((sum, data) => sum + (data.calories || 0), 0) / healthData.length
      );
      
      const totalExercise = healthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
      
      const avgFasting = (
        healthData.reduce((sum, data) => sum + (data.fastingHours || 0), 0) / healthData.length
      ).toFixed(1);
      
      const weights = healthData.filter(data => data.weight).map(data => data.weight);
      const weightChange = weights.length > 1 ? 
        (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
      const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
      
      res.json({
        avgCalories,
        totalExercise,
        avgFasting: parseFloat(avgFasting),
        weightChange: weightChange ? parseFloat(weightChange) : null,
        currentWeight,
        daysTracked: healthData.length
      });
    }
  );
});

// Monthly summary
app.get('/api/summary/month/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
  
  db.all(
    'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date',
    [startDate, endDate],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const healthData = rows
        .map(row => row.health_data ? JSON.parse(row.health_data) : null)
        .filter(data => data);
      
      if (healthData.length === 0) {
        res.json({
          avgCalories: 0,
          totalExercise: 0,
          avgFasting: 0,
          weightChange: null,
          currentWeight: null,
          daysTracked: 0
        });
        return;
      }
      
      const avgCalories = Math.round(
        healthData.reduce((sum, data) => sum + (data.calories || 0), 0) / healthData.length
      );
      
      const totalExercise = healthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
      
      const avgFasting = (
        healthData.reduce((sum, data) => sum + (data.fastingHours || 0), 0) / healthData.length
      ).toFixed(1);
      
      const weights = healthData.filter(data => data.weight).map(data => data.weight);
      const weightChange = weights.length > 1 ? 
        (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
      const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
      
      res.json({
        avgCalories,
        totalExercise,
        avgFasting: parseFloat(avgFasting),
        weightChange: weightChange ? parseFloat(weightChange) : null,
        currentWeight,
        daysTracked: healthData.length
      });
    }
  );
});
// Overall progress summary (add this after the monthly summary endpoint)
app.get('/api/summary/overall', (req, res) => {
  db.all(
    'SELECT * FROM entries WHERE health_data IS NOT NULL ORDER BY date',
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const allHealthData = rows
        .map(row => ({ 
          date: row.date, 
          ...JSON.parse(row.health_data) 
        }))
        .filter(data => data.weight); // Only entries with weight data
      
      if (allHealthData.length < 2) {
        res.json({
          message: 'Need at least 2 weight entries to show progress',
          entries: allHealthData.length
        });
        return;
      }
      
      const startWeight = allHealthData[0].weight;
      const currentWeight = allHealthData[allHealthData.length - 1].weight;
      const totalWeightLost = (startWeight - currentWeight).toFixed(1);
      const startDate = allHealthData[0].date;
      const currentDate = allHealthData[allHealthData.length - 1].date;
      
      // Calculate days between
      const start = new Date(startDate);
      const current = new Date(currentDate);
      const daysDiff = Math.floor((current - start) / (1000 * 60 * 60 * 24));
      
      res.json({
        startWeight,
        currentWeight,
        totalWeightLost: parseFloat(totalWeightLost),
        startDate,
        currentDate,
        daysBetween: daysDiff,
        totalWeighIns: allHealthData.length
      });
    }
  );
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

// Catch-all handler for frontend routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});



// Start server
app.listen(PORT, () => {
  console.log(`Health Journal API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});