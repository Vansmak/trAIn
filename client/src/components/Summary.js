import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function Summary({ data, period }) {
  const chartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Hydration (cups)',
        data: [10.5, 8, 9, 7, 10, 11, 9], // Example data
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
      {
        label: 'Deficit (cal)',
        data: [1364, 1200, 1100, 900, 1500, 1400, 1300],
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
      }
    ]
  };

  return (
    <div className="summary">
      <h2>{period === 'weekly' ? 'Weekly' : 'Monthly'} Summary</h2>
      <Bar data={chartData} />
    </div>
  );
}

export default Summary;