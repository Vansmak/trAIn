// client/src/App.js
import React, { useState, useEffect } from 'react';
import Calendar from './components/Calendar';
import Timeline from './components/Timeline';
import Summary from './components/Summary';
import axios from 'axios';
import moment from 'moment-timezone';
import './App.css';

function App() {
  const [selectedDate, setSelectedDate] = useState('2025-04-28');
  const [entryData, setEntryData] = useState({});
  const [userData, setUserData] = useState({
    weight: 190,
    age: 54,
    tdee: 2572,
    daysSober: 30,
    fasting: { start: '5:59 p.m.', end: '9:30 a.m.', status: 'Fasting', elapsed: '0h 0m' }
  });

  const calculateFastingTime = (start, end) => {
    const now = moment().tz('America/Los_Angeles');
    const [startTime, startPeriod] = start.split(' ');
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endTime, endPeriod] = end.split(' ');
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startDate = moment.tz(selectedDate, 'America/Los_Angeles');
    startDate.set({ hour: startPeriod === 'p.m.' && startHour !== 12 ? startHour + 12 : startHour, minute: startMinute });
    const endDate = moment.tz(selectedDate, 'America/Los_Angeles');
    endDate.set({ hour: endPeriod === 'p.m.' && endHour !== 12 ? endHour + 12 : endHour, minute: endMinute });
    if (endDate.isBefore(startDate)) endDate.add(1, 'day');

    const diffMs = now.diff(startDate);
    const duration = moment.duration(diffMs);
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    const status = now.isBetween(startDate, endDate) ? 'Fasting' : 'Eating Window';

    return {
      status,
      elapsed: `${hours}h ${minutes}m`,
      startFormatted: startDate.format('h:mm a'),
      endFormatted: endDate.format('h:mm a')
    };
  };

  useEffect(() => {
    console.log('Fetching data for date:', selectedDate); // Debug log
    axios.get(`http://backend:5000/api/entries/${selectedDate}`)
      .then(res => {
        console.log('API Response:', res.data); // Debug log
        setEntryData(res.data);
        if (res.data.fasting) {
          setUserData(prev => ({
            ...prev,
            fasting: {
              ...prev.fasting,
              start: res.data.fasting.start,
              end: res.data.fasting.end,
              ...calculateFastingTime(res.data.fasting.start, res.data.fasting.end)
            }
          }));
        } else {
          setUserData(prev => ({
            ...prev,
            fasting: {
              ...prev.fasting,
              ...calculateFastingTime(prev.fasting.start, prev.fasting.end)
            }
          }));
        }
      })
      .catch(err => {
        console.error('Error fetching entry:', err);
        setEntryData({}); // Reset entry data on error
      });

    const timer = setInterval(() => {
      setUserData(prev => ({
        ...prev,
        fasting: {
          ...prev.fasting,
          ...calculateFastingTime(prev.fasting.start, prev.fasting.end)
        }
      }));
    }, 60000);

    return () => clearInterval(timer);
  }, [selectedDate]);

  const handleJournalSubmit = (journal, images) => {
    console.log('Submitting journal for date:', selectedDate); // Debug log
    const formData = new FormData();
    formData.append('date', selectedDate);
    formData.append('journal', journal);
    images.forEach(img => formData.append('images', img));

    axios.post('http://backend:5000/api/entries', formData)
      .then(res => {
        console.log('Submit Response:', res.data); // Debug log
        setEntryData(res.data.data);
      })
      .catch(err => console.error('Error submitting journal:', err));
  };

  const handleFastingUpdate = (field, value) => {
    const newFasting = { ...userData.fasting, [field]: value };
    setUserData(prev => ({
      ...prev,
      fasting: {
        ...newFasting,
        ...calculateFastingTime(newFasting.start, newFasting.end)
      }
    }));

    axios.post(`http://backend:5000/api/fasting/${selectedDate}`, {
      start: newFasting.start,
      end: newFasting.end
    }).catch(err => console.error(err));
  };

  return (
    <div className="app">
      <header>
        <h1>Mindful Progress Tracker</h1>
        <div className="header-stats">
          <p>Last Weight: {userData.weight} lbs</p>
          <p>Days Sober: {userData.daysSober}</p>
          <div className="fasting-timer">
            <p>{userData.fasting.status}: {userData.fasting.elapsed}</p>
            <p>Started Fast: <input
              type="text"
              value={userData.fasting.start}
              onChange={(e) => handleFastingUpdate('start', e.target.value)}
              placeholder="e.g., 5:59 p.m."
            /></p>
            <p>{userData.fasting.status === 'Fasting' ? 'Ends' : 'Ended Fast'}: <input
              type="text"
              value={userData.fasting.end}
              onChange={(e) => handleFastingUpdate('end', e.target.value)}
              placeholder="e.g., 9:30 a.m."
            /></p>
          </div>
        </div>
      </header>
      <Calendar onDateSelect={setSelectedDate} />
      <h3>Selected Date: {selectedDate}</h3> {/* Display selected date */}
      <Timeline data={entryData} />
      <Summary data={entryData} period="weekly" />
      <div className="journal-input">
        <h4>Journal Entry for {selectedDate}</h4>
        <textarea
          placeholder="Paste your journal entry here..."
          onBlur={(e) => handleJournalSubmit(e.target.value, [])}
        />
        <input
          type="file"
          multiple
          onChange={(e) => handleJournalSubmit(document.querySelector('textarea').value, Array.from(e.target.files))}
        />
        <button onClick={() => handleJournalSubmit(document.querySelector('textarea').value, [])}>
          Submit Journal Entry
        </button>
      </div>
    </div>
  );
}

export default App;