import React, { useState, useRef } from 'react';
import {
  Slider, Box, Typography, TextField,
  Button, Tooltip, IconButton, Select, MenuItem
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  Title, Tooltip as ChartTooltip, Legend
} from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import InfoIcon from '@mui/icons-material/Info';
import { useFileContext } from './FileContext';
import { ChartOptions } from 'chart.js';
import { LogarithmicScale } from 'chart.js';
ChartJS.register(LogarithmicScale);



ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, Title, ChartTooltip, Legend, zoomPlugin);

const ViolationGuidelines: React.FC = () => {
  const [conformance, setConformance] = useState<number>(0);
  const [resourceInput, setResourceInput] = useState<string>('');
  const [selectedResources, setSelectedResources] = useState<number[]>([]);
  const [chartType, setChartType] = useState<'role' | 'amount' | 'resource'>('role');
  const [selectedAttribute, setSelectedAttribute] = useState<string>('event:org:resource');
  const chartRef = useRef<any>(null);
  const navigate = useNavigate();

  const { attributeConformance, amountConformanceData } = useFileContext();
  const attributeOptions = Object.keys(attributeConformance || {});

  const formatRoleLabel = (role: string) => role.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const getColorForConformance = (value: number): string => {
    const colors = ['#67000d', '#a50f15', '#cb181d', '#ef3b2c', '#fb6a4a', '#fc9272', '#fcbba1', '#fee0d2', '#fff5f0'];
    const index = Math.min(Math.floor(value * colors.length), colors.length - 1);
    return colors[index];
  };

  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    setConformance(newValue as number);
  };

  const handleResourceInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const numbers = event.target.value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    setResourceInput(event.target.value);
    setSelectedResources(numbers);
  };

  const handleReset = () => {
    setConformance(0);
    setResourceInput('');
    setSelectedResources([]);
    if (chartRef.current) chartRef.current.resetZoom();
  };


;
  const filteredAttributeData = (attributeConformance[selectedAttribute] ?? [])
  .filter((item, index) =>
    item.averageConformance >= conformance &&
    (selectedResources.length === 0 || selectedResources.includes(index + 1))
  );

  const isNumericAttribute = React.useMemo(() => {
      if (
        selectedAttribute === "event:org:resource" ||
        selectedAttribute === "event:org:role"
      ) {
        // Force categorical for these
        return false;
      }

      const data = attributeConformance[selectedAttribute] ?? [];
      return (
        data.length > 0 &&
        data.every((item) => !isNaN(Number(item.value)))
      );
    }, [attributeConformance, selectedAttribute]);

  const categoricalChartData = {
    labels: filteredAttributeData.map((r) => r.value),
    datasets: [
      {
        label: 'Average Conformance',
        data: filteredAttributeData.map(item => ({
          x: item.value,
          y: item.averageConformance,
          traceCount: item.traceCount ?? 'N/A'
        })),
        backgroundColor: filteredAttributeData.map(r => getColorForConformance(r.averageConformance)),
        borderWidth: 1,
      },
    ],
  };

  const numericalChartData = {
    datasets: [
      {
        label: `${selectedAttribute} vs Conformance`,
        data: filteredAttributeData.map(item => ({
          x: Number(item.value),
          y: item.averageConformance
        })),
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: '#000',
        borderWidth: 0.5,
      },
    ],
  };

  const attributeChartData = {
    labels: filteredAttributeData.map((r: any) => r.value),
    datasets: [
      {
        label: 'Average Conformance',
        data: filteredAttributeData.map((item: any) => ({
          x: item.value,
          y: item.averageConformance,
          traceCount: item.traceCount ?? 'N/A',
        })),
        backgroundColor: filteredAttributeData.map((r: any) => getColorForConformance(r.averageConformance)),
        borderWidth: 1,
      },
    ],
  };






// Clean and filter the data
const filteredAmountData = Array.isArray(amountConformanceData)
  ? amountConformanceData
      .filter(item => item.conformance >= 0 && item.conformance <= 1 && item.requested_amount > 0)
      .sort((a, b) => a.requested_amount - b.requested_amount)
  : [];

// Remove top 1% outliers (simple cut)
const cutoffIndex = Math.floor(filteredAmountData.length * 0.99);
const prunedData = filteredAmountData.slice(0, cutoffIndex);

// Prepare the chart data
const scatterData = {
  datasets: [
    {
      label: 'Requested Amount vs Conformance',
      data: prunedData.map(item => ({
        x: item.conformance,
        y: item.requested_amount,
      })),
      backgroundColor: 'rgba(54, 162, 235, 0.7)',
      borderColor: '#000',
      borderWidth: 0.5,
    },
  ],
};


  const roleOptions = {
    indexAxis: 'x' as const,
    scales: {
      x: { title: { display: true, text: selectedAttribute } },
      y: { beginAtZero: true, max: 1, title: { display: true, text: 'Conformance' } }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `Conformance: ${context.raw.y}, Trace Count: ${context.raw.traceCount ?? 'N/A'}`,
        },
      },
    },
    maintainAspectRatio: false,
  };

const scatterOptions: ChartOptions<'scatter'> = {
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Conformance' },
      min: 0,
      max: 1,
    },
    y: {
      type: 'logarithmic',
      title: {
        display: true,
        text: 'Requested Amount (log scale)',
      },
      min: 1,
      ticks: {
        callback: (value: any) => Number(value).toLocaleString(),
      },
    },
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: (context: any) => `Conformance: ${context.raw.x}, Requested Amount: ${context.raw.y.toLocaleString()}`,
      },
    },
    zoom: {
      pan: { enabled: true, mode: 'xy' },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
    },
  },
  maintainAspectRatio: false,
};



  return (
    <Box sx={{ width: 800, height: 900, margin: '0 auto', position: 'relative' }}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
        <Typography variant="h5" gutterBottom align="center">
          Violation Guidelines: Conformance Visualization
        </Typography>
        <Tooltip title="This view illustrates the relationship between various event or trace attributes and conformance. Users can explore different visualizations by selecting the desired attribute from the dropdown menu." arrow>
          <IconButton><InfoIcon color="primary" /></IconButton>
        </Tooltip>
      </Box>


      <Typography variant="h6">Conformance Threshold</Typography>
      <Slider
        value={conformance}
        min={0}
        max={1}
        step={0.01}
        onChange={handleSliderChange}
        valueLabelDisplay="auto"
        sx={{ color: getColorForConformance(conformance), '& .MuiSlider-thumb': { backgroundColor: '#000' } }}
      />
      <Typography>Current Conformance: {conformance.toFixed(2)}</Typography>

      <Button variant="contained" color="primary" onClick={handleReset} sx={{ my: 2 }}>
        Reset
      </Button>
<Box sx={{ mb: 2 }}>
  <Select
    value={selectedAttribute}
    onChange={(e) => setSelectedAttribute(e.target.value)}
    sx={{ width: 'fit-content', minWidth: 280 }}
  >
    {attributeOptions.map(attr => (
      <MenuItem key={attr} value={attr}>
        {attr}
      </MenuItem>
    ))}
  </Select>
</Box>


<TextField
  fullWidth
  variant="outlined"
  value={resourceInput}
  onChange={handleResourceInput}
  placeholder={`Enter ${selectedAttribute} Index Numbers (comma-separated, e.g., 1,2)`}
  sx={{ mb: 2 }}
/>

<Box sx={{ height: 500 }}>
  {isNumericAttribute ? (
    <Scatter ref={chartRef} data={numericalChartData} options={{
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: selectedAttribute },
        },
        y: {
          min: 0,
          max: 1,
          title: { display: true, text: 'Conformance' },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context: any) => `${selectedAttribute}: ${context.raw.x}, Conformance: ${context.raw.y}`,
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
        },
      },
      maintainAspectRatio: false,
    }} />
  ) : (
    <Bar ref={chartRef} data={categoricalChartData} options={roleOptions} />
  )}
</Box>


<>
  <Button
    variant="contained"
    color="primary"
    sx={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      fontSize: '1.5rem',
      minWidth: '50px',
      height: '50px',
      fontWeight: 'bold',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}
    onClick={() => navigate('/heatmap-aggr')}
  >
    ←
  </Button>
  <Button
    variant="contained"
    color="primary"
    sx={{
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      fontSize: '1.5rem',
      minWidth: '50px',
      height: '50px',
      fontWeight: 'bold',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}
    onClick={() => navigate('/conformance-outcome')}
  >
    →
  </Button>
</>

    </Box>
  );
};

export default ViolationGuidelines;



















    























