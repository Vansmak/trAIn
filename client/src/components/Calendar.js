import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';

function Calendar({ onDateSelect }) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin]}
      initialView="dayGridMonth"
      events={[{ title: 'Entry', date: '2025-04-28' }]} // Populate dynamically
      dateClick={(info) => onDateSelect(info.dateStr)}
    />
  );
}

export default Calendar;