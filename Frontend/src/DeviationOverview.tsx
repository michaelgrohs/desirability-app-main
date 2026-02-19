import React, { useEffect, useState, useRef } from 'react';
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
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from './FileContext';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { useBottomNav } from './BottomNavContext';

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

interface ConstraintItem {
  constraint: string;
  type: string;
  operands: string[];
  violation_count: number;
  support: number;
  confidence: number;
}

interface DeclarativeData {
  constraints: ConstraintItem[];
}

const DeviationOverview: React.FC = () => {
  const navigate = useNavigate();
  const { selectedDeviations, setSelectedDeviations, conformanceMode } = useFileContext();
  const { setContinue } = useBottomNav();

  useEffect(() => {
    setContinue({
      label: "Continue",
      onClick: () => navigate("/select-dimensions"),
      disabled: selectedDeviations.length === 0,
    });
    return () => setContinue(null);
  }, [selectedDeviations, navigate, setContinue]);

  const [data, setData] = useState<DeviationData | null>(null);
  const [declarativeData, setDeclarativeData] = useState<DeclarativeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  // Model viewer state
  const [modelType, setModelType] = useState<'bpmn' | 'pnml' | 'declarative' | null>(null);
  const [modelContent, setModelContent] = useState<string | null>(null);
  const [modelConstraints, setModelConstraints] = useState<any[]>([]);
  const bpmnContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

    useEffect(() => {
      fetch(`${API_URL}/api/preview-matrix`)
        .then(res => res.json())
        .then(data => {
          setPreviewColumns(data.columns);
          setPreviewRows(data.rows);
        });
    }, [selectedDeviations]);

  // -------- FETCH MODEL CONTENT --------
  useEffect(() => {
    fetch(`${API_URL}/api/model-content`)
      .then(res => res.json())
      .then(data => {
        setModelType(data.type);
        if (data.type === 'declarative') {
          setModelConstraints(data.constraints || []);
          setModelContent(null);
        } else {
          setModelContent(data.content);
          setModelConstraints([]);
        }
      })
      .catch(err => console.error("Failed to load model:", err));
  }, []);

  // -------- RENDER BPMN VIEWER --------
  useEffect(() => {
    if (modelType === 'bpmn' && modelContent && bpmnContainerRef.current) {
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
      const viewer = new NavigatedViewer({ container: bpmnContainerRef.current });
      viewerRef.current = viewer;

      viewer.importXML(modelContent).then(() => {
        const canvas = viewer.get('canvas') as any;
        canvas.zoom('fit-viewport');
      }).catch((err: any) => console.error('BPMN render error:', err));

      return () => {
        viewer.destroy();
        viewerRef.current = null;
      };
    }
  }, [modelType, modelContent]);

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
        if (conformanceMode === 'declarative') {
          setDeclarativeData(json);
        } else {
          setData(json);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl, conformanceMode]);

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
  // BPMN mode: Toggle Selection
  // =========================
  const handleToggle = (activity: string, type: 'skip' | 'insertion') => {
      const column =
        type === 'skip'
          ? `(Skip ${activity})`
          : `(Insert ${activity})`;

      setSelectedDeviations((prev) => {
        const exists = prev.find((d) => d.column === column);

        if (exists) {
          return prev.filter((d) => d.column !== column);
        }

        return [
          ...prev,
          {
            column,
            label: activity,
            type
          }
        ];
      });
    };

  // =========================
  // Declarative mode: Toggle Constraint
  // =========================
  const handleConstraintToggle = (constraint: ConstraintItem) => {
    const column = constraint.constraint;
    setSelectedDeviations((prev) => {
      const exists = prev.find((d) => d.column === column);
      if (exists) {
        return prev.filter((d) => d.column !== column);
      }
      return [
        ...prev,
        {
          column,
          label: `${constraint.type}: ${constraint.operands[0]} → ${constraint.operands[1]}`,
          type: constraint.type,
        }
      ];
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
                  (d) =>
                    d.column ===
                    (type === 'skip'
                      ? `(Skip ${item.activity})`
                      : `(Insert ${item.activity})`)
                )}
              onChange={() => handleToggle(item.activity, type)}
            />
            <Typography>{item.activity}</Typography>
          </Box>

          <Typography fontWeight="bold">
            {item.count.toLocaleString('en-US')}
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

  // =========================
  // Declarative: Render constraint list grouped by type
  // =========================
  const renderConstraintList = (constraints: ConstraintItem[]) => {
    const grouped: Record<string, ConstraintItem[]> = {};
    constraints.forEach(c => {
      if (!grouped[c.type]) grouped[c.type] = [];
      grouped[c.type].push(c);
    });

    return Object.entries(grouped).map(([type, items]) => (
      <Card key={type} sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{type}</Typography>
          <Divider sx={{ mb: 1 }} />
          {items.map((item, index) => {
            const maxCount = Math.max(...constraints.map(c => c.violation_count), 1);
            return (
              <Box key={index} sx={{ mb: 2 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box display="flex" alignItems="center">
                    <Checkbox
                      checked={selectedDeviations.some(d => d.column === item.constraint)}
                      onChange={() => handleConstraintToggle(item)}
                    />
                    <Box>
                      <Typography>
                        {item.operands[0]} → {item.operands[1]}
                      </Typography>
                      <Box display="flex" gap={1} mt={0.5}>
                        <Chip label={`Violations: ${item.violation_count.toLocaleString('en-US')}`} size="small" color="error" variant="outlined" />
                        <Chip label={`Support: ${(item.support * 100).toFixed(1)}%`} size="small" variant="outlined" />
                        <Chip label={`Confidence: ${(item.confidence * 100).toFixed(1)}%`} size="small" variant="outlined" />
                      </Box>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ height: 6, backgroundColor: '#eee', borderRadius: 2, mt: 1 }}>
                  <Box
                    sx={{
                      height: 6,
                      width: `${(item.violation_count / maxCount) * 100}%`,
                      backgroundColor: '#ed6c02',
                      borderRadius: 2,
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </CardContent>
      </Card>
    ));
  };

  // =========================
  // Matrix preview table (shared between modes)
  // =========================
  const renderMatrixPreview = () => {
    if (previewColumns.length === 0 || previewRows.length === 0) return null;

    return (
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
                      {row[col] !== null && row[col] !== undefined
                        ? typeof row[col] === "number"
                          ? row[col].toLocaleString('en-US')
                          : String(row[col])
                        : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '90vw', maxWidth: 1100, margin: '0 auto', mt: 4 }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={4}>
        <Typography variant="h5">
          Select Deviations of Interest
        </Typography>
        <Tooltip
          title={conformanceMode === 'declarative'
            ? "This page shows constraints mined from your event log that are violated by at least some traces. Each bar indicates how often the constraint is violated. Select the constraints you want to investigate — only selected deviations will be analyzed in the following steps."
            : "This page shows deviations detected between your event log and the process model. Skipped activities (model moves) were expected by the model but did not occur. Inserted activities (log moves) occurred in the log but are not part of the model. The bar indicates frequency. Select the deviations you want to investigate — only selected deviations will be analyzed in the following steps."
          }
          arrow
          placement="right"
        >
          <IconButton>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* MODEL VIEWER — BPMN mode */}
      {conformanceMode === 'bpmn' && modelContent && (
        <Paper sx={{ mb: 4, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Process Model
          </Typography>
          {modelType === 'bpmn' ? (
            <Box
              ref={bpmnContainerRef}
              sx={{
                width: '100%',
                height: 400,
                border: '1px solid #eee',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                maxHeight: 400,
                overflow: 'auto',
                border: '1px solid #eee',
                borderRadius: 1,
                '& svg': { width: '100%', height: 'auto' },
              }}
              dangerouslySetInnerHTML={{ __html: modelContent }}
            />
          )}
        </Paper>
      )}

      {/* MODEL VIEWER — Declarative mode: constraint summary table */}
      {conformanceMode === 'declarative' && modelConstraints.length > 0 && (
        <Paper sx={{ mb: 4, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Mined Declarative Model ({modelConstraints.length.toLocaleString()} constraints)
          </Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Operand A</TableCell>
                  <TableCell>Operand B</TableCell>
                  <TableCell align="right">Support</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modelConstraints.map((c: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{c.type}</TableCell>
                    <TableCell>{c.op_0}</TableCell>
                    <TableCell>{c.op_1}</TableCell>
                    <TableCell align="right">{(c.support * 100).toFixed(1)}%</TableCell>
                    <TableCell align="right">{(c.confidence * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

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

      {/* BPMN mode: skips & insertions */}
      {!loading && !error && conformanceMode === 'bpmn' && data && (
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

          {renderMatrixPreview()}
        </>
      )}

      {/* Declarative mode: constraint list */}
      {!loading && !error && conformanceMode === 'declarative' && declarativeData && (
        <>
          {renderConstraintList(declarativeData.constraints)}
          {renderMatrixPreview()}
        </>
      )}
    </Box>
  );
};

export default DeviationOverview;
