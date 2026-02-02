import React, { useState, useRef } from 'react';
import { Slider, Box, Typography, MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register necessary components for Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, zoomPlugin);

// Function to get color based on the conformance value (mimicking Reds colormap)
const getColorForValue = (value: number): string => {
  const colors = [
    '#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a',
    '#ef3b2c', '#cb181d', '#a50f15', '#67000d'
  ];

  const index = Math.min(Math.floor(value * colors.length), colors.length - 1);
  return colors[index];
};

// Sample data for traces and conformance values
const traces = Array.from({ length: 50 }, (_, i) => `Trace ${i + 1}`);
const conformanceValues = Array.from({ length: 50 }, () => Math.random());

// Histogram Options
const histogramOptions = {
  scales: {
    y: {
      beginAtZero: true,
      max: 10,  // Adjust this based on your expected distribution
    },
  },
  plugins: {
    legend: {
      display: false,
    },
  },
  maintainAspectRatio: false,
};

const options = {
  indexAxis: 'x' as const,  // Switch to make bars vertical (like columns in a heatmap)
  scales: {
    y: {
      beginAtZero: true,
      max: 1,  // Conformance values are between 0 and 1
    },
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: function(tooltipItem: any) {
          return `Conformance: ${tooltipItem.raw}`;
        },
      },
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'x' as const,  // Enable panning on the x-axis (for traces)
      },
      zoom: {
        wheel: {
          enabled: true,  // Enable zooming with the mouse wheel
        },
        pinch: {
          enabled: true,  // Enable zooming with pinch gestures
        },
        mode: 'x' as const,  // Enable zooming only on the x-axis (for traces)
      },
    },
    legend: {
      display: false,  // No need for a legend in this case
    },
  },
  hover: {
    mode: 'nearest' as const,  // Explicitly cast "nearest" to satisfy TypeScript
    onHover: function(event: any, chartElement: any) {
      const chart = event.native.target;
      chart.style.cursor = chartElement[0] ? 'pointer' : 'default';
    },
  },
  layout: {
    padding: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    }
  },
  elements: {
    bar: {
      borderWidth: 1,  // Make it look more heatmap-like
      borderRadius: 0, // No rounding, make them square-like
    }
  },
  maintainAspectRatio: false,  // Allow custom height to fit all traces
};

const HeatMapNoAggr: React.FC = () => {
  const [conformance, setConformance] = useState<number>(0);
  const [selectedTraces, setSelectedTraces] = useState<string[]>([]); // Store selected traces
  const chartRef = useRef<any>(null);  // Reference to the chart for zoom control

  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    setConformance(newValue as number);
  };

  // Handle trace selection
  const handleTraceSelection = (event: any) => {
    const value = event.target.value;
    setSelectedTraces(value);
  };

  // Filter traces based on conformance threshold and selected traces
  const filteredData = traces
    .map((trace, index) => ({ trace, conformance: conformanceValues[index] }))
    .filter(item => item.conformance >= conformance && (selectedTraces.length === 0 || selectedTraces.includes(item.trace)))
    .sort((a, b) => b.conformance - a.conformance);  // Sort by conformance in descending order

  const sortedTraces = filteredData.map(item => item.trace);
  const sortedConformance = filteredData.map(item => item.conformance);

  // Prepare chart data for the heatmap
  const data = {
    labels: sortedTraces,
    datasets: [
      {
        label: 'Conformance',
        data: sortedConformance,
        backgroundColor: sortedConformance.map(value => getColorForValue(value)),
      },
    ],
  };

  // Create data for the conformance histogram (based on selected traces and conformance threshold)
  const histogramData = {
    labels: ['0.9-1', '0.8-0.9', '0.7-0.8', '0.6-0.7', '0.5-0.6', '0.4-0.5', '0.3-0.4', '0.2-0.3', '0.1-0.2', '0-0.1'],
    datasets: [
      {
        label: 'Conformance Distribution',
        data: Array(10).fill(0).map((_, i) => 
          filteredData.filter(item => item.conformance >= (9 - i) * 0.1 && item.conformance < (10 - i) * 0.1).length
        ),  // Calculate distribution in reverse
        backgroundColor: Array(10).fill(0).map((_, i) => getColorForValue((10 - i) / 10)), // Color bins like heatmap
      },
    ],
  };

  return (
    <Box sx={{ width: 800, height: 900, margin: '0 auto' }}> {/* Increased height to fit heatmap and histogram */}
      <Typography variant="h6" gutterBottom>
        Conformance Threshold
      </Typography>
      <Slider
        value={conformance}
        min={0}
        max={1}
        step={0.01}
        onChange={handleSliderChange}
        valueLabelDisplay="auto"
        sx={{
          color: getColorForValue(conformance),
          '& .MuiSlider-thumb': {
            backgroundColor: '#000',
          },
        }}
      />
      <Typography variant="body1" gutterBottom>
        Current Conformance: {conformance.toFixed(2)}
      </Typography>

      {/* Trace Selection Component */}
      <Typography variant="h6" gutterBottom>
        Select Traces to Compare
      </Typography>
      <Select
        multiple
        value={selectedTraces}
        onChange={handleTraceSelection}
        renderValue={(selected) => selected.join(', ')}
        sx={{ width: '100%', marginBottom: 2 }}
      >
        {traces.map((trace) => (
          <MenuItem key={trace} value={trace}>
            <Checkbox checked={selectedTraces.indexOf(trace) > -1} />
            <ListItemText primary={trace} />
          </MenuItem>
        ))}
      </Select>

      {/* Heatmap-like Bar Chart */}
      <Box sx={{ height: 500 }}>
        <Bar ref={chartRef} data={data} options={options} />
      </Box>

      {/* Histogram for Conformance Distribution */}
      <Box sx={{ height: 250, marginTop: 4 }}>
        <Typography variant="body1" gutterBottom>
          Conformance Distribution
        </Typography>
        <Bar data={histogramData} options={histogramOptions} />
      </Box>
    </Box>
  );
};

export default HeatMapNoAggr;
