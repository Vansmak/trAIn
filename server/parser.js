const natural = require('natural');

function parseJournalEntry(journal) {
  const lines = journal.split('\n');
  let parsed = {
    meals: [],
    hydration: 0,
    activity: [],
    fasting: {},
    calories: { intake: [0, 0], deficit: [0, 0] },
    wins: []
  };

  lines.forEach(line => {
    // Extract meals
    if (line.match(/\d{1,2}:\d{2}\s(a\.m\.|p\.m\.)/)) {
      const time = line.match(/\d{1,2}:\d{2}\s(a\.m\.|p\.m\.)/)[0];
      const mealMatch = line.match(/(Breakfast|Lunch|Snack|Dinner)\s-\s(.+)\s\((~\d+-\d+\scal)\)/);
      if (mealMatch) {
        parsed.meals.push({ time, description: mealMatch[2], calories: mealMatch[3] });
      }
    }
    // Extract hydration
    if (line.match(/Hydration:\s~(\d+\.?\d*)\scups/)) {
      parsed.hydration = parseFloat(line.match(/Hydration:\s~(\d+\.?\d*)\scups/)[1]);
    }
    // Extract activity (convert distances to imperial)
    if (line.match(/(Walk|Rowing|Biking)/)) {
      const timeMatch = line.match(/\d{1,2}:\d{2}\s(a\.m\.|p\.m\.)/);
      const time = timeMatch ? timeMatch[0] : '';
      const activityMatch = line.match(/(Walk|Rowing|Biking).*?\((\d+:\d+).*?(\d+)\scal\)/);
      if (activityMatch) {
        let distance = 0;
        if (line.match(/(\d+)\smeters/)) {
          distance = parseInt(line.match(/(\d+)\smeters/)[1]) * 0.000621371; // Convert meters to miles
        } else if (line.match(/(\d+\.?\d*)\smiles/)) {
          distance = parseFloat(line.match(/(\d+\.?\d*)\smiles/)[1]);
        }
        parsed.activity.push({
          time,
          type: activityMatch[1],
          duration: activityMatch[2],
          calories: parseInt(activityMatch[3]),
          distance: distance.toFixed(2) // In miles
        });
      }
    }
    // Extract fasting
    if (line.match(/Fasting:\s(\d{1,2}:\d{2}\s(a\.m\.|p\.m\.))\sto\s(\d{1,2}:\d{2}\s(a\.m\.|p\.m\.))/)) {
      const fastingMatch = line.match(/Fasting:\s(\d{1,2}:\d{2}\s(a\.m\.|p\.m\.))\sto\s(\d{1,2}:\d{2}\s(a\.m\.|p\.m\.))/);
      parsed.fasting = { start: fastingMatch[1], end: fastingMatch[3] };
    }
    // Extract calories and deficit (update TDEE to 2,572)
    if (line.match(/Total Estimated Intake:\s~(\d+)-(\d+)/)) {
      const calorieMatch = line.match(/Total Estimated Intake:\s~(\d+)-(\d+)/);
      parsed.calories.intake = [parseInt(calorieMatch[1]), parseInt(calorieMatch[2])];
      const tdee = 2572; // Updated TDEE
      parsed.calories.deficit = [
        tdee - parsed.calories.intake[1],
        tdee - parsed.calories.intake[0]
      ];
    }
    // Extract wins
    if (line.match(/Wins:\s(.+)/)) {
      parsed.wins = line.match(/Wins:\s(.+)/)[1].split(', ');
    }
  });

  return parsed;
}

module.exports = { parseJournalEntry };