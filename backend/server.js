const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

let userProfile = {};

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
  // Keep your existing entries table - DON'T TOUCH THIS
  db.run(`CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date TEXT UNIQUE,
    notes TEXT,
    photos TEXT,
    health_data TEXT,
    timestamp TEXT
  )`);
  
  // Create the user_profile table with ALL the columns (IF NOT EXISTS)
  db.run(`CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    date_of_birth TEXT,
    sex TEXT,
    height_feet INTEGER,
    height_inches INTEGER,
    height_cm REAL,
    weight_lbs REAL,
    weight_kg REAL,
    units TEXT DEFAULT 'imperial',
    activity_level TEXT,
    bmr REAL,
    tdee REAL,
    calorie_target REAL,
    custom_template TEXT, 
    updated_at TEXT
  )`);
});
function calculateFastingWindowSync(currentFirstMeal, prevLastMeal) {
  try {
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

    const prevLastMealMinutes = convertTo24Hour(prevLastMeal);
    const currentFirstMealMinutes = convertTo24Hour(currentFirstMeal);
    
    let fastingMinutes;
    if (currentFirstMealMinutes >= prevLastMealMinutes) {
      fastingMinutes = currentFirstMealMinutes - prevLastMealMinutes;
    } else {
      fastingMinutes = (24 * 60 - prevLastMealMinutes) + currentFirstMealMinutes;
    }
    
    return Math.round((fastingMinutes / 60) * 10) / 10;
  } catch (e) {
    console.error('Error calculating fasting window:', e);
    return 0;
  }
}
// BMR calculation using Mifflin-St Jeor equation
function calculateBMR(age, sex, heightInches, weightLbs) {
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

// Updated parseHealthData function in server.js
function parseHealthData(entryText) {
  const data = {
    calories: 0,
    caloriesBurned: 0,  // Add this new field
    exercise: 0,
    weight: null,
    fastingHours: 0,
    lastMealTime: null,
    firstMealTime: null
  };

  // Extract calories consumed - handle multiple formats
  const caloriesPatterns = [
    /Total calories:.*?~?([\d,]+)/i,
    /Total calories consumed:.*?~?([\d,]+)/i,
    /Net calories:.*?~?([\d,]+)/i,
    /Calories:.*?~?([\d,]+)/i
  ];

  for (const pattern of caloriesPatterns) {
    const match = entryText.match(pattern);
    if (match) {
      data.calories = parseInt(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract calories burned - NEW PATTERNS
  const caloriesBurnedPatterns = [
    /Calories burned:.*?~?([\d,]+)/i,
    /Burned:.*?~?([\d,]+)\s*cal/i,
    /Exercise calories:.*?~?([\d,]+)/i,
    /Workout.*?burned.*?~?([\d,]+)/i,
    /~([\d,]+)\s*cal\s*burned/i
  ];

  for (const pattern of caloriesBurnedPatterns) {
    const match = entryText.match(pattern);
    if (match) {
      data.caloriesBurned = parseInt(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Rest of parsing stays the same...
  // Extract exercise minutes - handle multiple formats
  const exercisePatterns = [
    /Exercise:.*?(\d+)\+?\s*min(?:utes)?/i,
    /Total.*?exercise.*?(\d+)\+?\s*min(?:utes)?/i,
    /(\d+)\+?\s*min(?:utes)?\s*total/i,
    /Exercise.*?(\d+)\+?\s*minutes?\s*total/i
  ];

  for (const pattern of exercisePatterns) {
    const match = entryText.match(pattern);
    if (match) {
      data.exercise = parseInt(match[1]);
      break;
    }
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

  // Extract fasting hours
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
  return data; // MOVE THIS TO THE VERY END
}


// User profile endpoints
app.get('/api/profile', (req, res) => {
  db.get('SELECT * FROM user_profile WHERE id = 1', (err, profile) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // If no profile exists or no weight, get latest weight from entries
    if (!profile || !profile.weight) {
      db.get(`
        SELECT health_data FROM entries 
        WHERE health_data IS NOT NULL 
        ORDER BY date DESC 
        LIMIT 1
      `, (err, entry) => {
        let latestWeight = null;
        if (entry && entry.health_data) {
          try {
            const healthData = JSON.parse(entry.health_data);
            latestWeight = healthData.weight;
          } catch (e) {}
        }
        
        const result = profile || {};
        if (latestWeight && !result.weight) {
          result.weight = latestWeight;
        }
        
        res.json(result);
      });
    } else {
      res.json(profile);
    }
  });
});

app.post('/api/profile', (req, res) => {
  const { date_of_birth, sex, height_feet, height_inches, weight, activity_level, custom_template } = req.body;
  
  // Calculate age from date of birth
  const today = new Date();
  const birthDate = new Date(date_of_birth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  const totalHeightInches = (height_feet || 0) * 12 + (height_inches || 0);
  const bmr = calculateBMR(age, sex, totalHeightInches, weight);
  const tdee = calculateTDEE(bmr, activity_level);
  const calorie_target = tdee - 500;
  
  const timestamp = new Date().toISOString();
  
  db.run(
    `INSERT OR REPLACE INTO user_profile 
     (id, date_of_birth, sex, height_feet, height_inches, height_cm, weight_lbs, weight_kg, units, activity_level, bmr, tdee, calorie_target, custom_template, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      date_of_birth, 
      sex, 
      height_feet, 
      height_inches, 
      totalHeightInches * 2.54, // Convert to cm
      weight, // weight_lbs
      weight * 0.453592, // Convert to kg
      'imperial', // units - hardcode for now
      activity_level, 
      bmr, 
      tdee, 
      calorie_target, 
      custom_template, 
      timestamp
    ],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        date_of_birth, sex, height_feet, height_inches, weight, activity_level, custom_template,
        age,
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        calorie_target: Math.round(calorie_target)
      });
    }
  );
});
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

// Updated weekly summary calculation with proper deficit
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
            avgCaloriesBurned: 0,
            totalExercise: 0,
            avgFasting: 0,
            weightChange: null,
            currentWeight: null,
            daysTracked: 0,
            calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
            totalCalorieDeficit: 0,
            avgDailyDeficit: 0,
            totalNetCalorieDeficit: 0,  // NEW: True deficit including exercise
            avgDailyNetDeficit: 0       // NEW: True daily deficit including exercise
          });
          return;
        }
        
        // Enhanced health data with proper parsing
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
        
        // Calculate averages
        const avgCalories = Math.round(
          enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0) / enhancedHealthData.length
        );
        
        const avgCaloriesBurned = Math.round(
          enhancedHealthData.reduce((sum, data) => sum + (data.caloriesBurned || 0), 0) / enhancedHealthData.length
        );
        
        const totalExercise = enhancedHealthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
        
        const validFastingData = enhancedHealthData.filter(data => data.fastingHours > 0);
        const avgFasting = validFastingData.length > 0 ? 
          (validFastingData.reduce((sum, data) => sum + data.fastingHours, 0) / validFastingData.length).toFixed(1) : 0;
        
        const weights = enhancedHealthData.filter(data => data.weight).map(data => data.weight);
        const weightChange = weights.length > 1 ? 
          (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
        const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        
        // Calculate calorie deficit/surplus (OLD and NEW methods)
        let totalCalorieDeficit = 0;
        let avgDailyDeficit = 0;
        let totalNetCalorieDeficit = 0;  // NEW: True deficit including exercise
        let avgDailyNetDeficit = 0;     // NEW: True daily deficit including exercise
        
        if (calorieTarget) {
          // OLD METHOD: Just consumed vs target
          const totalCalories = enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0);
          const targetCalories = calorieTarget * enhancedHealthData.length;
          totalCalorieDeficit = targetCalories - totalCalories;
          avgDailyDeficit = totalCalorieDeficit / enhancedHealthData.length;
          
          // NEW METHOD: Net calories (consumed - burned) vs target
          const totalNetCalories = enhancedHealthData.reduce((sum, data) => {
            const consumed = data.calories || 0;
            const burned = data.caloriesBurned || 0;
            return sum + (consumed - burned);
          }, 0);
          totalNetCalorieDeficit = targetCalories - totalNetCalories;
          avgDailyNetDeficit = totalNetCalorieDeficit / enhancedHealthData.length;
        }
        
        res.json({
          avgCalories,
          avgCaloriesBurned,
          totalExercise,
          avgFasting: parseFloat(avgFasting),
          weightChange: weightChange ? parseFloat(weightChange) : null,
          currentWeight,
          daysTracked: enhancedHealthData.length,
          calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
          totalCalorieDeficit: Math.round(totalCalorieDeficit),
          avgDailyDeficit: Math.round(avgDailyDeficit),
          totalNetCalorieDeficit: Math.round(totalNetCalorieDeficit),
          avgDailyNetDeficit: Math.round(avgDailyNetDeficit)
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
            avgCaloriesBurned: 0,
            totalExercise: 0,
            avgFasting: 0,
            weightChange: null,
            currentWeight: null,
            daysTracked: 0,
            calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
            totalCalorieDeficit: 0,
            avgDailyDeficit: 0,
            totalNetCalorieDeficit: 0,
            avgDailyNetDeficit: 0
          });
          return;
        }
        
        // Reparse all entries with smart fasting calculation
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
        
        const avgCaloriesBurned = Math.round(
          enhancedHealthData.reduce((sum, data) => sum + (data.caloriesBurned || 0), 0) / enhancedHealthData.length
        );
        
        const totalExercise = enhancedHealthData.reduce((sum, data) => sum + (data.exercise || 0), 0);
        
        const validFastingData = enhancedHealthData.filter(data => data.fastingHours > 0);
        const avgFasting = validFastingData.length > 0 ? 
          (validFastingData.reduce((sum, data) => sum + data.fastingHours, 0) / validFastingData.length).toFixed(1) : 0;
        
        const weights = enhancedHealthData.filter(data => data.weight).map(data => data.weight);
        const weightChange = weights.length > 1 ? 
          (weights[weights.length - 1] - weights[0]).toFixed(1) : null;
        const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        
        // Calculate calorie deficit/surplus (both old and new methods)
        let totalCalorieDeficit = 0;
        let avgDailyDeficit = 0;
        let totalNetCalorieDeficit = 0;
        let avgDailyNetDeficit = 0;
        
        if (calorieTarget) {
          // OLD METHOD: Just consumed vs target
          const totalCalories = enhancedHealthData.reduce((sum, data) => sum + (data.calories || 0), 0);
          const targetCalories = calorieTarget * enhancedHealthData.length;
          totalCalorieDeficit = targetCalories - totalCalories;
          avgDailyDeficit = totalCalorieDeficit / enhancedHealthData.length;
          
          // NEW METHOD: Net calories (consumed - burned) vs target
          const totalNetCalories = enhancedHealthData.reduce((sum, data) => {
            const consumed = data.calories || 0;
            const burned = data.caloriesBurned || 0;
            return sum + (consumed - burned);
          }, 0);
          totalNetCalorieDeficit = targetCalories - totalNetCalories;
          avgDailyNetDeficit = totalNetCalorieDeficit / enhancedHealthData.length;
        }
        
        res.json({
          avgCalories,
          avgCaloriesBurned,
          totalExercise,
          avgFasting: parseFloat(avgFasting),
          weightChange: weightChange ? parseFloat(weightChange) : null,
          currentWeight,
          daysTracked: enhancedHealthData.length,
          calorieTarget: calorieTarget ? Math.round(calorieTarget) : null,
          totalCalorieDeficit: Math.round(totalCalorieDeficit),
          avgDailyDeficit: Math.round(avgDailyDeficit),
          totalNetCalorieDeficit: Math.round(totalNetCalorieDeficit),
          avgDailyNetDeficit: Math.round(avgDailyNetDeficit)
        });
      }
    );
  });
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