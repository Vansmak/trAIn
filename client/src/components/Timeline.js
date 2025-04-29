function Timeline({ data }) {
  if (!data.meals) return <p>No data for this day.</p>;

  return (
    <div className="timeline">
      <h2>Daily Timeline</h2>
      {data.fasting.start && (
        <div className="entry">
          <p>Started Fast: {data.fasting.start}</p>
        </div>
      )}
      {data.meals.map((meal, idx) => (
        <div key={idx} className="entry">
          <p>{meal.time}: {meal.description} ({meal.calories})</p>
          {data.images && data.images[idx] && <img src={data.images[idx]} alt="Meal" />}
        </div>
      ))}
      {data.activity.map((act, idx) => (
        <div key={idx} className="entry">
          <p>{act.time ? `${act.time}: ` : ''}{act.type} ({act.duration}, {act.calories} cal, {act.distance} miles)</p>
          {data.images && data.images[idx + data.meals.length] && <img src={data.images[idx + data.meals.length]} alt="Activity" />}
        </div>
      ))}
      {data.fasting.end && (
        <div className="entry">
          <p>Ended Fast: {data.fasting.end}</p>
        </div>
      )}
      <div className="totals">
        <p>Hydration: {data.hydration} cups</p>
        <p>Estimated Calories: {data.calories.intake.join('-')}</p>
        <p>Deficit: {data.calories.deficit.join('-')} cal</p>
        <p>Exercise: {data.activity.reduce((sum, act) => sum + act.calories, 0)} cal</p>
        <p>Wins: {data.wins.join(', ')}</p>
      </div>
    </div>
  );
}

export default Timeline;