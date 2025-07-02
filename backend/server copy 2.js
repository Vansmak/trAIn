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
  
  // Add user profile table
  db.run(`CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    age INTEGER,
    sex TEXT,
    height_feet INTEGER,
    height_inches INTEGER,
    weight REAL,
    activity_level TEXT,
    bmr REAL,
    tdee REAL,
    calorie_target REAL,
    updated_at TEXT
  )`);
});

// BMR calculation using Mifflin-St Jeor equation
function calculateBMR(age, sex, heightInches, weightLbs) {
  // Convert to metric
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;
  
  if (sex.toLowerCase() === 'male') {
    return (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  } else {
    return (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  }
}

// TDEE calculation
function calculateTDEE(bmr, activityLevel) {
  const multipliers = {
    'sedentary': 1.2,
    'lightly_active': 1.375,
    'moderately_active': 1.55,
    'very_active': 1.725,
    'extremely_active': 1.9
  };
  return bmr * (multipliers[activityLevel] || 1.2);
}

function parseHealthData(entryText) {
  const data = {
    calories: 0,
    exercise: 0,
    weight: null,
    fastingHours: 0,
    lastMealTime: null,
    firstMealTime: null
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
    /weighed?\s+in\s+at\s+([\d.]+)/i,
    /weighed?\s+([\d.]+)/i,
    /weight:?\s*([\d.]+)/i,
    /([\d.]+)\s*lbs?/i
  ];
  
  for (const pattern of weightPatterns) {
    const match = entryText.match(pattern);
    if (match) {
      data.weight = parseFloat(match[1]);
      break;
    }
  }

  // First try to find explicit fasting window
  const fastingMatch = entryText.match(/Fasting window:.*?([\d.]+)\s*hours?/i);
  if (fastingMatch) {
    data.fastingHours = parseFloat(fastingMatch[1]);
  }

  // Extract meal times for cross-day fasting calculation
  const timePattern = /\*\*(\d{1,2}:\d{2}\s*[AP]M)\*\*\s*-\s*([^\n]+)/g;
  
  const timedEntries = [];
  let match;
  while ((match = timePattern.exec(entryText)) !== null) {
    const time = match[1];
    const content = match[2].toLowerCase();
    
    const fastingFriendly = [
      'black coffee', 'coffee', 'water', 'tea', 'sparkling water', 'electrolytes'
    ];
    
    const calories = content.match(/~?(\d+)\s*cal/);
    const calorieCount = calories ? parseInt(calories[1]) : 0;
    
    const breaksFast = calorieCount > 20 || 
      (!fastingFriendly.some(item => content.includes(item)) && 
       !content.includes('~5 cal') && 
       !content.includes('0 cal'));
    
    timedEntries.push({
      time: time,
      content: content,
      breaksFast: breaksFast
    });
  }
  
  const fastBreakingMeals = timedEntries.filter(entry => entry.breaksFast);
  
  if (fastBreakingMeals.length > 0) {
    const convertTo24Hour = (timeStr) => {
      const [time, period] = timeStr.split(/\s*([AP]M)/i);
      let [hours, minutes] = time.split(':').map(Number);
      
      if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
      }
      
      return hours * 60 + minutes;
    };

    const mealTimes = fastBreakingMeals.map(meal => ({
      time: meal.time,
      minutes: convertTo24Hour(meal.time)
    })).sort((a, b) => a.minutes - b.minutes);
    
    data.firstMealTime = mealTimes[0].time;
    data.lastMealTime = mealTimes[mealTimes.length - 1].time;
  }

  console.log('Parsed data:', data);
  return data;
}

async function calculateFastingWindow(currentDate, currentData, db) {
  return new Promise((resolve) => {
    if (currentData.fastingHours > 0) {
      resolve(currentData.fastingHours);
      return;
    }

    if (!currentData.firstMealTime) {
      resolve(0);
      return;
    }

    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    db.get('SELECT health_data FROM entries WHERE date = ?', [prevDateStr], (err, row) => {
      if (err || !row) {
        resolve(0);
        return;
      }

      try {
        const prevData = JSON.parse(row.health_data);
        if (!prevData.lastMealTime) {
          resolve(0);
          return;
        }

        const convertTo24Hour = (timeStr) => {
          const [time, period] = timeStr.split(/\s*([AP]M)/i);
          let [hours, minutes] = time.split(':').map(Number);
          
          if (period.toUpperCase() === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period.toUpperCase() === 'AM' && hours === 12) {
            hours = 0;
          }
          
          return hours * 60 + minutes;
        };

        const lastMealMinutes = convertTo24Hour(prevData.lastMealTime);
        const firstMealMinutes = convertTo24Hour(currentData.firstMealTime);
        
        let fastingMinutes;
        if (firstMealMinutes >= lastMealMinutes) {
          fastingMinutes = firstMealMinutes - lastMealMinutes;
        } else {
          fastingMinutes = (24 * 60 - lastMealMinutes) + firstMealMinutes;
        }
        
        const fastingHours = fastingMinutes / 60;
        resolve(Math.round(fastingHours * 10) / 10);
        
      } catch (e) {
        resolve(0);
      }
    });
  });
}

function calculateFastingWindowSync(firstMealTime, lastMealTime) {
  const convertTo24Hour = (timeStr) => {
    const [time, period] = timeStr.split(/\s*([AP]M)/i);
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return hours * 60 + minutes;
  };

  try {
    const lastMealMinutes = convertTo24Hour(lastMealTime);
    const firstMealMinutes = convertTo24Hour(firstMealTime);
    
    let fastingMinutes;
    if (firstMealMinutes >= lastMealMinutes) {
      fastingMinutes = firstMealMinutes - lastMealMinutes;
    } else {
      fastingMinutes = (24 * 60 - lastMealMinutes) + firstMealMinutes;
    }
    
    const fastingHours = fastingMinutes / 60;
    return Math.round(fastingHours * 10) / 10;
  } catch (e) {
    return 0;
  }
}

// User profile endpoints
app.get('/api/profile', (req, res) => {
  db.get('SELECT * FROM user_profile WHERE id = 1', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || {});
  });
});

app.post('/api/profile', (req, res) => {
  const { age, sex, height_feet, height_inches, weight, activity_level } = req.body;
  
  const totalHeightInches = (height_feet || 0) * 12 + (height_inches || 0);
  const bmr = calculateBMR(age, sex, totalHeightInches, weight);
  const tdee = calculateTDEE(bmr, activity_level);
  
  // Default calorie target is TDEE minus 500 for weight loss
  const calorie_target = tdee - 500;
  
  const timestamp = new Date().toISOString();
  
  db.run(
    `INSERT OR REPLACE INTO user_profile 
     (id, age, sex, height_feet, height_inches, weight, activity_level, bmr, tdee, calorie_target, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [age, sex, height_feet, height_inches, weight, activity_level, bmr, tdee, calorie_target, timestamp],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        age, sex, height_feet, height_inches, weight, activity_level,
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        calorie_target: Math.round(calorie_target)
      });
    }
  );
});

app.post('/api/entries/:date', async (req, res) => {
  const date = req.params.date;
  const { notes, photos } = req.body;
  
  if (!notes && (!photos || photos.length === 0)) {
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
  
  const calculatedFasting = await calculateFastingWindow(date, healthData, db);
  if (calculatedFasting > 0) {
    healthData.fastingHours = calculatedFasting;
  }
  
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

app.get('/api/summary/week/:date', async (req, res) => {
  const date = new Date(req.params.date);
  const dayOfWeek = date.getDay();
  
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; 
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - daysToSubtract);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  const startDate = startOfWeek.toISOString().split('T')[0];
  const endDate = endOfWeek.toISOString().split('T')[0];
  
  // Get user profile for calorie target
  db.get('SELECT calorie_target FROM user_profile WHERE id = 1', (err, profile) => {
    const calorieTarget = profile ? profile.calorie_target : null;
    
    db.all(
      'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date',
      [startDate, endDate],
      async (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        if (rows.length === 0) {
          res.json({
            avgCalories: 0,
            totalExercise: 0,
            avgFasting: 0,
            weightChange: null,
            currentWeight: null,
            daysTracked: 0,
            calorieTarget,
            totalCalorieDeficit: 0,
            avgDailyDeficit: 0
          });
          return;
        }
        
        const enhancedHealthData = [];
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const originalData = row.health_data ? JSON.parse(row.health_data) : {};
          const reparsedData = parseHealthData(row.notes || '');
          
          let smartFasting = reparsedData.fastingHours;
          if (smartFasting === 0 && reparsedData.firstMealTime && i > 0) {
            const prevRow = rows[i - 1];
            if (prevRow && prevRow.health_data) {
              const prevData = JSON.parse(prevRow.health_data);
              const prevReparsed = parseHealthData(prevRow.notes || '');
              
              if (prevReparsed.lastMealTime) {
                smartFasting = calculateFastingWindowSync(
                  reparsedData.firstMealTime, 
                  prevReparsed.lastMealTime
                );
              }
            }
          }
          
          enhancedHealthData.push({
            ...originalData,
            ...reparsedData,
            fastingHours: smartFasting || originalData.fastingHours || 0
          });
        }
        
        const avgCalories = Math.round(
          enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0) / enhancedHealthData.length
        );
        
        const totalExercise = enhancedHealthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
        
        const validFastingData = enhancedHealthData.filter(data => data.fastingHours > 0);
        const avgFasting = validFastingData.length > 0 ? 
          (validFastingData.reduce((sum, data) => sum + data.fastingHours, 0) / validFastingData.length).toFixed(1) : 0;
        
        const weights = enhancedHealthData.filter(data => data.weight).map(data => data.weight);
        const weightChange = weights.length > 1 ? 
          (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
        const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        
        // Calculate calorie deficit/surplus
        let totalCalorieDeficit = 0;
        let avgDailyDeficit = 0;
        
        if (calorieTarget) {
          const totalCalories = enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0);
          const targetCalories = calorieTarget * enhancedHealthData.length;
          totalCalorieDeficit = targetCalories - totalCalories;
          avgDailyDeficit = totalCalorieDeficit / enhancedHealthData.length;
        }
        
        res.json({
          avgCalories,
          totalExercise,
          avgFasting: parseFloat(avgFasting),
          weightChange: weightChange ? parseFloat(weightChange) : null,
          currentWeight,
          daysTracked: enhancedHealthData.length,
          calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
          totalCalorieDeficit: Math.round(totalCalorieDeficit),
          avgDailyDeficit: Math.round(avgDailyDeficit)
        });
      }
    );
  });
});

app.get('/api/summary/month/:year/:month', (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
  
  // Get user profile for calorie target
  db.get('SELECT calorie_target FROM user_profile WHERE id = 1', (err, profile) => {
    const calorieTarget = profile ? profile.calorie_target : null;
    
    db.all(
      'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date',
      [startDate, endDate],
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        if (rows.length === 0) {
          res.json({
            avgCalories: 0,
            totalExercise: 0,
            avgFasting: 0,
            weightChange: null,
            currentWeight: null,
            daysTracked: 0,
            calorieTarget,
            totalCalorieDeficit: 0,
            avgDailyDeficit: 0
          });
          return;
        }
        
        const enhancedHealthData = [];
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const originalData = row.health_data ? JSON.parse(row.health_data) : {};
          const reparsedData = parseHealthData(row.notes || '');
          
          let smartFasting = reparsedData.fastingHours;
          if (smartFasting === 0 && reparsedData.firstMealTime && i > 0) {
            const prevRow = rows[i - 1];
            if (prevRow && prevRow.health_data) {
              const prevData = JSON.parse(prevRow.health_data);
              const prevReparsed = parseHealthData(prevRow.notes || '');
              
              if (prevReparsed.lastMealTime) {
                smartFasting = calculateFastingWindowSync(
                  reparsedData.firstMealTime, 
                  prevReparsed.lastMealTime
                );
              }
            }
          }
          
          enhancedHealthData.push({
            ...originalData,
            ...reparsedData,
            fastingHours: smartFasting || originalData.fastingHours || 0
          });
        }
        
        const avgCalories = Math.round(
          enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0) / enhancedHealthData.length
        );
        
        const totalExercise = enhancedHealthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
        
        const validFastingData = enhancedHealthData.filter(data => data.fastingHours > 0);
        const avgFasting = validFastingData.length > 0 ? 
          (validFastingData.reduce((sum, data) => sum + data.fastingHours, 0) / validFastingData.length).toFixed(1) : 0;
        
        const weights = enhancedHealthData.filter(data => data.weight).map(data => data.weight);
        const weightChange = weights.length > 1 ? 
          (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
        const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        
        // Calculate calorie deficit/surplus
        let totalCalorieDeficit = 0;
        let avgDailyDeficit = 0;
        
        if (calorieTarget) {
          const totalCalories = enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0);
          const targetCalories = calorieTarget * enhancedHealthData.length;
          totalCalorieDeficit = targetCalories - totalCalories;
          avgDailyDeficit = totalCalorieDeficit / enhancedHealthData.length;
        }
        
        res.json({
          avgCalories,
          totalExercise,
          avgFasting: parseFloat(avgFasting),
          weightChange: weightChange ? parseFloat(weightChange) : null,
          currentWeight,
          daysTracked: enhancedHealthData.length,
          calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
          totalCalorieDeficit: Math.round(totalCalorieDeficit),
          avgDailyDeficit: Math.round(avgDailyDeficit)
        });
      }
    );
  });
});

app.get('/api/summary/overall', (req, res) => {
  db.all(
    'SELECT * FROM entries WHERE health_data IS NOT NULL ORDER BY date',
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const allHealthData = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const originalData = row.health_data ? JSON.parse(row.health_data) : {};
        const reparsedData = parseHealthData(row.notes || '');
        
        if (reparsedData.weight || originalData.weight) {
          allHealthData.push({
            date: row.date,
            ...originalData,
            ...reparsedData,
            weight: reparsedData.weight || originalData.weight
          });
        }
      }
      
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

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Health Journal API running on port ${PORT}`);
});

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