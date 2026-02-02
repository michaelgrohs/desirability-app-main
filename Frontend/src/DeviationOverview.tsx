import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Checkbox,
  Button,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from './FileContext';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
  Legend
} from 'chart.js';

import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ChartTooltip,
  Legend
);

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

interface DeviationItem {
  activity: string;
  count: number;
}

interface DeviationData {
  skips: DeviationItem[];
  insertions: DeviationItem[];
}

interface SelectedDeviation {
  activity: string;
  type: 'skip' | 'insertion';
}

const DeviationOverview: React.FC = () => {
  const navigate = useNavigate();
  const { selectedDeviations, setSelectedDeviations } = useFileContext();

  const [data, setData] = useState<DeviationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

    useEffect(() => {
      fetch(`${API_URL}/api/preview-matrix`)
        .then(res => res.json())
        .then(data => {
          setPreviewColumns(data.columns);
          setPreviewRows(data.rows);
        });
    }, []);
  // -------- MATRIX STATE --------
  const [matrixColumns, setMatrixColumns] = useState<string[]>([]);
  const [matrixRows, setMatrixRows] = useState<any[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(true);

  const apiUrl = process.env.REACT_APP_API_URL;

  // =========================
  // Fetch Deviation Data
  // =========================
  useEffect(() => {
    if (!apiUrl) {
      setError('API URL is not defined. Check your .env file and restart React.');
      setLoading(false);
      return;
    }

    fetch(`${apiUrl}/api/deviation-overview`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch deviation overview');
        }
        return json;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl]);

  // =========================
  // Fetch Matrix Preview
  // =========================
  useEffect(() => {
    if (!apiUrl) return;

    fetch(`${apiUrl}/api/deviation-matrix`)
      .then(res => res.json())
      .then(json => {
        setMatrixColumns(json.columns);
        setMatrixRows(json.rows);
        setMatrixLoading(false);
      })
      .catch(() => {
        setMatrixLoading(false);
      });
  }, [apiUrl]);


  const createHistogram = (values: number[], bins = 20) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binSize = (max - min) / bins || 1;

      const counts = new Array(bins).fill(0);
      values.forEach(v => {
        const index = Math.min(Math.floor((v - min) / binSize), bins - 1);
        counts[index]++;
      });

      const labels = Array.from({ length: bins }, (_, i) =>
        (min + i * binSize).toFixed(0)
      );

      return { labels, counts };
    };

  // =========================
  // Toggle Selection (UNCHANGED)
  // =========================
  const handleToggle = (activity: string, type: 'skip' | 'insertion') => {
    setSelectedDeviations((prev: SelectedDeviation[]) => {
      const exists = prev.find(
        (d) => d.activity === activity && d.type === type
      );

      if (exists) {
        return prev.filter(
          (d) => !(d.activity === activity && d.type === type)
        );
      }

      return [...prev, { activity, type }];
    });
  };

  const renderList = (
    items: DeviationItem[],
    type: 'skip' | 'insertion'
  ) => {
    if (!items || items.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No deviations found.
        </Typography>
      );
    }

    const maxCount = Math.max(...items.map((i) => i.count));

    return items.map((item, index) => (
      <Box key={index} sx={{ mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <Checkbox
              checked={selectedDeviations.some(
                (d) => d.activity === item.activity && d.type === type
              )}
              onChange={() => handleToggle(item.activity, type)}
            />
            <Typography>{item.activity}</Typography>
          </Box>

          <Typography fontWeight="bold">
            {item.count}
          </Typography>
        </Box>

        <Box sx={{ height: 6, backgroundColor: '#eee', borderRadius: 2, mt: 0.5 }}>
          <Box
            sx={{
              height: 6,
              width: `${(item.count / maxCount) * 100}%`,
              backgroundColor: type === 'skip' ? '#d32f2f' : '#1976d2',
              borderRadius: 2,
            }}
          />
        </Box>
      </Box>
    ));
  };

  return (
    <Box sx={{ width: '90vw', maxWidth: 1100, margin: '0 auto', mt: 4 }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={4}>
        <Typography variant="h5">
          Select Deviations of Interest
        </Typography>
        <Tooltip
          title="Select skipped (model moves) and inserted (log moves) activities to analyze them in the next step."
          arrow
        >
          <IconButton>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && (
        <Box display="flex" justifyContent="center" mt={6}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Typography color="error" align="center">
          {error}
        </Typography>
      )}

      {!loading && !error && data && (
        <>
          <Box display="flex" gap={4}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Skipped Activities
                </Typography>
                <Divider sx={{ my: 2 }} />
                {renderList(data.skips, 'skip')}
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Inserted Activities
                </Typography>
                <Divider sx={{ my: 2 }} />
                {renderList(data.insertions, 'insertion')}
              </CardContent>
            </Card>
          </Box>

          {/* CONTINUE BUTTON */}
          <Box display="flex" justifyContent="center" mt={4}>
            <Button
              variant="contained"
              size="large"
              disabled={selectedDeviations.length === 0}
              onClick={() => navigate('/select-dimensions')}
            >
              Continue
            </Button>
          </Box>


        {previewColumns.length > 0 && previewRows.length > 0 && (
          <Box mt={9}>
            <Typography variant="h6" gutterBottom>
              Trace × Deviation Matrix
            </Typography>

            <Box sx={{ overflowX: 'auto', maxHeight: '10cm', overflowY: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {previewColumns.map((col) => {
                      const values = previewRows
                        .map((row) => row[col])
                        .filter((v) => v !== null && v !== undefined);

                      if (!values.length) {
                        return <TableCell key={col}>{col}</TableCell>;
                      }

                      const numericValues = values
                        .filter((v) => !isNaN(Number(v)))
                        .map(Number);

                      const chartData =
                        numericValues.length === values.length
                          ? createHistogram(numericValues, 10)
                          : values.reduce<Record<string, number>>((acc, v) => {
                              acc[String(v)] = (acc[String(v)] || 0) + 1;
                              return acc;
                            }, {});

                      const isHistogram = (
                        data: any
                      ): data is { labels: string[]; counts: number[] } =>
                        data && 'labels' in data && 'counts' in data;

                      const labels = isHistogram(chartData)
                        ? chartData.labels
                        : Object.keys(chartData);

                      const dataValues = isHistogram(chartData)
                        ? chartData.counts
                        : Object.values(chartData);

                      const backgroundColor = isHistogram(chartData)
                        ? 'rgba(25,118,210,0.6)'
                        : 'rgba(211,47,47,0.6)';

                      return (
                        <TableCell key={col} align="center">
                          <Typography variant="caption">{col}</Typography>
                          <Box sx={{ height: 40, mt: 0.5 }}>
                            <Bar
                              data={{
                                labels,
                                datasets: [
                                  {
                                    label: isHistogram(chartData)
                                      ? 'Frequency'
                                      : 'Count',
                                    data: dataValues,
                                    backgroundColor,
                                  },
                                ],
                              }}
                              options={{
                                responsive: true,
                                plugins: { legend: { display: false } },
                                scales: {
                                  x: { display: false },
                                  y: { display: false },
                                },
                                maintainAspectRatio: false,
                              }}
                            />
                          </Box>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {previewRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {previewColumns.map((col) => (
                        <TableCell key={col} align="center">
                          {row[col] !== null ? String(row[col]) : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}




        </>
      )}
    </Box>
  );
};

export default DeviationOverview;
