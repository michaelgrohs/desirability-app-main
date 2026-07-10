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
  Popover,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
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

interface TimeCondition {
  min: number;
  max: number;
  unit: string;
  raw: string;
}

interface ViolationDiagnostics {
  no_target_count: number;
  target_condition_failed_count: number;
  time_window_violated_count: number;
  time_violation_details: { trace_id: string; actual_seconds: number }[];
}

interface ConstraintItem {
  constraint: string;
  type: string;
  operands: string[];
  violation_count: number;
  support: number;
  confidence: number;
  activation_condition?: string | null;
  correlation_condition?: string | null;
  time_condition?: TimeCondition | null;
  is_data_aware?: boolean;
  has_time_constraint?: boolean;
  total_activations?: number;
  violation_diagnostics?: ViolationDiagnostics;
}

const UNIT_LABELS: Record<string, string> = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' };

const formatTimeCondition = (tc: TimeCondition): string => {
  const unit = UNIT_LABELS[tc.unit] ?? tc.unit;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (tc.min === tc.max) return `exactly ${fmt(tc.min)} ${unit}`;
  if (tc.min === 0) return `within ${fmt(tc.max)} ${unit}`;
  return `${fmt(tc.min)} – ${fmt(tc.max)} ${unit}`;
};

const formatSeconds = (s: number): string => {
  if (s >= 86400) return `${(s / 86400).toFixed(1)} days`;
  if (s >= 3600)  return `${(s / 3600).toFixed(1)} hrs`;
  if (s >= 60)    return `${(s / 60).toFixed(1)} min`;
  return `${s.toFixed(0)} s`;
};

interface DeclarativeData {
  constraints: ConstraintItem[];
}

// ── Histogram popover for matrix header cells ─────────────────────────────────
interface HistogramPopoverProps {
  col: string;
  chartData: { labels: string[]; dataValues: number[]; isHistogram: boolean };
}

const HistogramPopoverCell: React.FC<HistogramPopoverProps> = ({ col, chartData }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { labels, dataValues, isHistogram } = chartData;
  const backgroundColor = isHistogram ? 'rgba(25,118,210,0.6)' : 'rgba(211,47,47,0.6)';

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        sx={{ p: 0.25, ml: 0.5, color: '#bbb', '&:hover': { color: '#1976d2' } }}
      >
        <BarChartIcon sx={{ fontSize: 13 }} />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ p: 1.5, minWidth: 200 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{col}</Typography>
          <Box sx={{ height: 100, width: 200 }}>
            <Bar
              data={{
                labels,
                datasets: [{ label: isHistogram ? 'Frequency' : 'Count', data: dataValues, backgroundColor }],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { display: true, ticks: { maxRotation: 45, font: { size: 9 } } }, y: { display: true, ticks: { font: { size: 9 } } } },
                maintainAspectRatio: false,
              }}
            />
          </Box>
        </Box>
      </Popover>
    </>
  );
};

const DeviationOverview: React.FC = () => {
  const navigate = useNavigate();
  const { selectedDeviations, setSelectedDeviations, conformanceMode } = useFileContext();
  const { setContinue } = useBottomNav();

  const [lowSelectionWarningOpen, setLowSelectionWarningOpen] = useState(false);

  useEffect(() => {
    setContinue({
      label: "Continue",
      onClick: () => {
        if (selectedDeviations.length < 5) {
          setLowSelectionWarningOpen(true);
        } else {
          navigate("/select-dimensions");
        }
      },
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
  const [totalRows, setTotalRows] = useState<number>(0);
  const [distributions, setDistributions] = useState<Record<string, { labels: string[]; dataValues: number[]; isHistogram: boolean }>>({});

  // Trace × Deviation matrix visibility (hidden by default)
  const [showMatrix, setShowMatrix] = useState(false);

  // User-adjustable auto-selection threshold (default: 10 occurrences)
  const [threshold, setThreshold] = useState<number>(10);

  // Model viewer state
  const [modelType, setModelType] = useState<'bpmn' | 'pnml' | 'pnml_info' | 'declarative' | 'declarative-model' | null>(null);
  const [modelContent, setModelContent] = useState<string | null>(null);
  const [modelConstraints, setModelConstraints] = useState<any[]>([]);
  const [modelInfo, setModelInfo] = useState<{ activities: string[]; n_places: number; n_transitions: number; n_arcs: number } | null>(null);
  const bpmnContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/preview-matrix`)
      .then(res => res.json())
      .then(data => {
        setPreviewColumns(data.columns);
        setPreviewRows(data.rows);
        setTotalRows(data.total_rows ?? data.rows?.length ?? 0);
        setDistributions(data.distributions ?? {});
      });
  }, [selectedDeviations]);

  // -------- FETCH MODEL CONTENT --------
  useEffect(() => {
    fetch(`${API_URL}/api/model-content`)
      .then(res => res.json())
      .then(data => {
        setModelType(data.type);
        if (data.type === 'declarative' || data.type === 'declarative-model') {
          setModelConstraints(data.constraints || []);
          setModelContent(null);
          setModelInfo(null);
        } else if (data.type === 'pnml_info') {
          setModelInfo({ activities: data.activities || [], n_places: data.n_places, n_transitions: data.n_transitions, n_arcs: data.n_arcs });
          setModelContent(null);
          setModelConstraints([]);
        } else {
          setModelContent(data.content);
          setModelConstraints([]);
          setModelInfo(null);
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
        if (conformanceMode === 'declarative' || conformanceMode === 'declarative-model') {
          setDeclarativeData(json);
          // Pre-select constraints with ≥10 violations; always exclude zero-violation ones
          setSelectedDeviations(prev => {
            // If already has selections, only strip zero-violation ones
            if (prev.length > 0) {
              const zeroCols = new Set(
                (json.constraints ?? [])
                  .filter((c: ConstraintItem) => c.violation_count === 0)
                  .map((c: ConstraintItem) => c.constraint)
              );
              return prev.filter(d => !zeroCols.has(d.column));
            }
            // Fresh load: pre-select those with ≥10 violations
            return (json.constraints ?? [])
              .filter((c: ConstraintItem) => c.violation_count >= 10)
              .map((c: ConstraintItem) => ({
                column: c.constraint,
                label: `${c.type}: ${c.operands[0]} → ${c.operands[1] || ''}`,
                type: c.type,
              }));
          });
        } else {
          setData(json);
          // Pre-select deviations with ≥10 occurrences; always exclude zero-count ones
          setSelectedDeviations(prev => {
            if (prev.length > 0) {
              const zeroCols = new Set<string>();
              (json.skips ?? []).forEach((i: DeviationItem) => { if (i.count === 0) zeroCols.add(`(Skip ${i.activity})`); });
              (json.insertions ?? []).forEach((i: DeviationItem) => { if (i.count === 0) zeroCols.add(`(Insert ${i.activity})`); });
              return prev.filter(d => !zeroCols.has(d.column));
            }
            // Fresh load: pre-select those with ≥10 occurrences
            const preSelected: typeof prev = [];
            (json.skips ?? []).forEach((i: DeviationItem) => {
              if (i.count >= 10) preSelected.push({ column: `(Skip ${i.activity})`, label: i.activity, type: 'skip' });
            });
            (json.insertions ?? []).forEach((i: DeviationItem) => {
              if (i.count >= 10) preSelected.push({ column: `(Insert ${i.activity})`, label: i.activity, type: 'insertion' });
            });
            return preSelected;
          });
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
          label: `${constraint.type}: ${constraint.operands[0]} → ${constraint.operands[1] || ''}`,
          type: constraint.type,
        }
      ];
    });
  };


  // =========================
  // Re-apply the auto-selection threshold on demand
  // =========================
  const applyThreshold = () => {
    if (conformanceMode === 'declarative' || conformanceMode === 'declarative-model') {
      if (!declarativeData) return;
      setSelectedDeviations(
        (declarativeData.constraints ?? [])
          .filter((c) => {
            const neverActivated = conformanceMode === 'declarative-model' && (c.total_activations ?? -1) === 0;
            return !neverActivated && c.violation_count >= threshold;
          })
          .map((c) => ({
            column: c.constraint,
            label: `${c.type}: ${c.operands[0]} → ${c.operands[1] || ''}`,
            type: c.type,
          }))
      );
    } else {
      if (!data) return;
      const preSelected: typeof selectedDeviations = [];
      (data.skips ?? []).forEach((i) => {
        if (i.count >= threshold) preSelected.push({ column: `(Skip ${i.activity})`, label: i.activity, type: 'skip' });
      });
      (data.insertions ?? []).forEach((i) => {
        if (i.count >= threshold) preSelected.push({ column: `(Insert ${i.activity})`, label: i.activity, type: 'insertion' });
      });
      setSelectedDeviations(preSelected);
    }
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

    return items.map((item, index) => {
      const isZero = item.count === 0;
      return (
        <Box key={index} sx={{ mb: 2, opacity: isZero ? 0.5 : 1 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <Tooltip
                title={isZero ? "No occurrences detected — nothing to investigate." : ""}
                disableHoverListener={!isZero}
                arrow
              >
                <span>
                  <Checkbox
                    checked={selectedDeviations.some(
                      (d) =>
                        d.column ===
                        (type === 'skip'
                          ? `(Skip ${item.activity})`
                          : `(Insert ${item.activity})`)
                    )}
                    onChange={() => handleToggle(item.activity, type)}
                    disabled={isZero}
                  />
                </span>
              </Tooltip>
              <Typography color={isZero ? 'text.disabled' : 'text.primary'}>{item.activity}</Typography>
            </Box>
            <Typography fontWeight="bold" color={isZero ? 'text.disabled' : 'text.primary'}>
              {item.count.toLocaleString('en-US')}
            </Typography>
          </Box>
          {isZero && (
            <Typography variant="caption" sx={{ color: '#9e9e9e', display: 'block', ml: 5 }}>
              No occurrences — cannot be investigated.
            </Typography>
          )}
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
      );
    });
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
            const neverActivated = conformanceMode === 'declarative-model' && (item.total_activations ?? -1) === 0;
            const noViolations = item.violation_count === 0;
            const isDisabled = neverActivated || noViolations;
            return (
              <Box key={index} sx={{ mb: 2, opacity: isDisabled ? 0.5 : 1 }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                  <Box display="flex" alignItems="flex-start">
                    <Tooltip
                      title={noViolations && !neverActivated ? "No violations detected — nothing to investigate." : ""}
                      disableHoverListener={!noViolations || neverActivated}
                      arrow
                    >
                      <span>
                        <Checkbox
                          checked={selectedDeviations.some(d => d.column === item.constraint)}
                          onChange={() => handleConstraintToggle(item)}
                          disabled={isDisabled}
                          sx={{ mt: -0.5 }}
                        />
                      </span>
                    </Tooltip>
                    <Box>
                      <Typography>
                        {item.operands[0]}
                        {item.operands[1] ? ` → ${item.operands[1]}` : ''}
                      </Typography>

                      {/* Data & time condition tags */}
                      {conformanceMode === 'declarative-model' && (item.is_data_aware || item.has_time_constraint) && (
                        <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                          {item.activation_condition && (
                            <Tooltip title={`Activation guard (on ${item.operands[0]}): ${item.activation_condition}`} arrow>
                              <Chip
                                label={`A: ${item.activation_condition.length > 40 ? item.activation_condition.slice(0, 40) + '…' : item.activation_condition}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: 10, borderColor: '#f57c00', color: '#e65100', maxWidth: 320 }}
                              />
                            </Tooltip>
                          )}
                          {item.correlation_condition && (
                            <Tooltip title={`Target/correlation guard (on ${item.operands[1] || 'target'}): ${item.correlation_condition}`} arrow>
                              <Chip
                                label={`T: ${item.correlation_condition.length > 40 ? item.correlation_condition.slice(0, 40) + '…' : item.correlation_condition}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: 10, borderColor: '#7b1fa2', color: '#6a1b9a', maxWidth: 320 }}
                              />
                            </Tooltip>
                          )}
                          {item.time_condition && (
                            <Tooltip title={`Time window between activation and target: ${item.time_condition.raw}`} arrow>
                              <Chip
                                label={`⏱ ${formatTimeCondition(item.time_condition)}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: 10, borderColor: '#0288d1', color: '#01579b', maxWidth: 260 }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      )}

                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                        <Chip label={`Violations: ${item.violation_count.toLocaleString('en-US')}`} size="small" color="error" variant="outlined" />
                        {conformanceMode === 'declarative-model' && item.total_activations !== undefined && (
                          <Chip
                            label={`Activations: ${item.total_activations.toLocaleString('en-US')}`}
                            size="small"
                            color={neverActivated ? 'default' : 'success'}
                            variant="outlined"
                          />
                        )}
                        {conformanceMode !== 'declarative-model' && (
                          <>
                            <Chip label={`Support: ${(item.support * 100).toFixed(1)}%`} size="small" variant="outlined" />
                            <Chip label={`Confidence: ${(item.confidence * 100).toFixed(1)}%`} size="small" variant="outlined" />
                          </>
                        )}
                      </Box>

                      {neverActivated && (
                        <Typography variant="caption" sx={{ color: '#9e9e9e', display: 'block', mt: 0.5 }}>
                          Never activated — constraint was not triggered in any trace. Violations are vacuous and cannot be investigated.
                        </Typography>
                      )}
                      {!neverActivated && noViolations && (
                        <Typography variant="caption" sx={{ color: '#9e9e9e', display: 'block', mt: 0.5 }}>
                          No violations — all traces satisfy this constraint. Nothing to investigate.
                        </Typography>
                      )}

                      {/* Violation diagnostics breakdown */}
                      {conformanceMode === 'declarative-model' && !neverActivated && item.violation_diagnostics && (
                        (() => {
                          const d = item.violation_diagnostics!;
                          const total = d.no_target_count + d.target_condition_failed_count + d.time_window_violated_count;
                          if (total === 0) return null;
                          return (
                            <Box mt={0.75} p={0.75} sx={{ background: '#fff8e1', borderRadius: 1, border: '1px solid #ffe082' }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: '#e65100', display: 'block', mb: 0.25 }}>
                                Violation causes ({total} activations diagnosed):
                              </Typography>
                              <Box display="flex" flexWrap="wrap" gap={0.5}>
                                {d.no_target_count > 0 && (
                                  <Tooltip title="Target activity was not found in the required position" arrow>
                                    <Chip
                                      label={`No target B: ${d.no_target_count}`}
                                      size="small"
                                      sx={{ fontSize: 10, background: '#fce4ec', color: '#c62828', border: '1px solid #ef9a9a' }}
                                    />
                                  </Tooltip>
                                )}
                                {d.target_condition_failed_count > 0 && (
                                  <Tooltip title="Target B occurred but the T. correlation condition was not satisfied" arrow>
                                    <Chip
                                      label={`T. condition failed: ${d.target_condition_failed_count}`}
                                      size="small"
                                      sx={{ fontSize: 10, background: '#ede7f6', color: '#4527a0', border: '1px solid #b39ddb' }}
                                    />
                                  </Tooltip>
                                )}
                                {d.time_window_violated_count > 0 && (
                                  <Tooltip
                                    title={
                                      d.time_violation_details.length > 0
                                        ? `Avg actual time: ${formatSeconds(d.time_violation_details.reduce((s, x) => s + x.actual_seconds, 0) / d.time_violation_details.length)}`
                                        : 'Time window was exceeded'
                                    }
                                    arrow
                                  >
                                    <Chip
                                      label={`Time window exceeded: ${d.time_window_violated_count}${item.time_condition ? ` (allowed: ${formatTimeCondition(item.time_condition)})` : ''}`}
                                      size="small"
                                      sx={{ fontSize: 10, background: '#e3f2fd', color: '#0d47a1', border: '1px solid #90caf9' }}
                                    />
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                          );
                        })()
                      )}
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ height: 6, backgroundColor: '#eee', borderRadius: 2, mt: 1 }}>
                  <Box
                    sx={{
                      height: 6,
                      width: `${(item.violation_count / maxCount) * 100}%`,
                      backgroundColor: isDisabled ? '#ccc' : '#ed6c02',
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

    // Use backend-computed distributions (based on all traces), falling back to preview rows
    const colChartData: Record<string, { labels: string[]; dataValues: number[]; isHistogram: boolean }> = {};
    previewColumns.forEach((col) => {
      if (distributions[col]) {
        colChartData[col] = distributions[col];
        return;
      }
      // fallback: compute from preview rows
      const values = previewRows
        .map((row) => row[col])
        .filter((v) => v !== null && v !== undefined && !Array.isArray(v));
      if (!values.length) {
        colChartData[col] = { labels: [], dataValues: [], isHistogram: false };
        return;
      }
      const numericValues = values.filter((v) => !isNaN(Number(v))).map(Number);
      const isHistogram = numericValues.length === values.length;
      if (isHistogram) {
        const h = createHistogram(numericValues, 10);
        colChartData[col] = { labels: h.labels, dataValues: h.counts, isHistogram: true };
      } else {
        const freq = values.reduce<Record<string, number>>((acc, v) => {
          acc[String(v)] = (acc[String(v)] || 0) + 1;
          return acc;
        }, {});
        colChartData[col] = { labels: Object.keys(freq), dataValues: Object.values(freq), isHistogram: false };
      }
    });

    return (
      <Box mt={9}>
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          sx={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setShowMatrix((v) => !v)}
        >
          <IconButton size="small" sx={{ p: 0.25 }}>
            <ExpandMoreIcon sx={{ transform: showMatrix ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
          <Typography variant="h6">Trace × Deviation Matrix</Typography>
          <Typography variant="body2" color="text.secondary">
            {showMatrix ? '(click to hide)' : '(click to show)'}
          </Typography>
          {totalRows > 0 && (
            <Tooltip
              arrow
              title={
                totalRows > 100
                  ? `Showing 100 of ${totalRows.toLocaleString('en-US')} total traces. The full analysis (causal effects, criticality, root causes) uses all ${totalRows.toLocaleString('en-US')} traces — this table is a preview only.`
                  : `Showing all ${totalRows.toLocaleString('en-US')} traces.`
              }
            >
              <Box display="flex" alignItems="center" sx={{ cursor: 'default' }}>
                {totalRows > 100 ? (
                  <WarningAmberIcon sx={{ fontSize: 18, color: '#ed6c02' }} />
                ) : (
                  <InfoIcon sx={{ fontSize: 18, color: '#9e9e9e' }} />
                )}
                <Typography variant="caption" color={totalRows > 100 ? '#ed6c02' : 'text.secondary'} sx={{ ml: 0.5 }}>
                  {totalRows > 100
                    ? `100 of ${totalRows.toLocaleString('en-US')} traces shown`
                    : `${totalRows.toLocaleString('en-US')} traces`}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {showMatrix && (
        <Box sx={{ overflowX: 'auto', maxHeight: '10cm', overflowY: 'auto', mt: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {previewColumns.map((col) => {
                  const cd = colChartData[col];
                  const hasChart = cd && cd.labels.length > 0;
                  return (
                    <TableCell key={col} align="center" sx={{ whiteSpace: 'nowrap', px: 1, py: 0.75 }}>
                      <Box display="flex" alignItems="center" justifyContent="center" gap={0.25}>
                        <Tooltip title={col} arrow placement="top">
                          <Typography
                            variant="caption"
                            sx={{
                              maxWidth: 100,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'block',
                              cursor: 'default',
                            }}
                          >
                            {col}
                          </Typography>
                        </Tooltip>
                        {hasChart && <HistogramPopoverCell col={col} chartData={cd} />}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {previewRows.slice(0, 100).map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {previewColumns.map((col) => {
                    const val = row[col];
                    let display: React.ReactNode;

                    if (val === null || val === undefined) {
                      display = '–';
                    } else if (Array.isArray(val)) {
                      // Activity sequence: show count badge + tooltip with first few items
                      const count = (val as string[]).length;
                      const preview = (val as string[]).slice(0, 3).join(' › ');
                      const full = (val as string[]).join(' › ');
                      display = (
                        <Tooltip title={full} arrow placement="top">
                          <Box component="span" sx={{ cursor: 'default', fontSize: 10 }}>
                            {preview}{count > 3 ? ` … +${count - 3}` : ''}
                          </Box>
                        </Tooltip>
                      );
                    } else if (typeof val === 'number') {
                      display = val.toLocaleString('en-US');
                    } else {
                      const str = String(val);
                      display = str.length > 30 ? (
                        <Tooltip title={str} arrow placement="top">
                          <Box component="span" sx={{ cursor: 'default' }}>
                            {str.slice(0, 30)}…
                          </Box>
                        </Tooltip>
                      ) : str;
                    }

                    return (
                      <TableCell key={col} align="center" sx={{ fontSize: 11, whiteSpace: 'nowrap', px: 1, maxWidth: 160, overflow: 'hidden' }}>
                        {display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ width: '90vw', maxWidth: 1100, margin: '0 auto', mt: 4 }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={2}>
        <Typography variant="h5">
          Select Deviations of Interest
        </Typography>
        <Tooltip
          title={conformanceMode === 'declarative'
            ? "This page shows constraints mined from your event log that are violated by at least some traces. Each bar indicates how often the constraint is violated. Select the constraints you want to investigate — only selected deviations will be analyzed in the following steps."
            : conformanceMode === 'declarative-model'
            ? "This page shows violations detected against your uploaded .decl model. Each bar indicates how many traces violate that constraint. Data-aware constraints show their activation/target conditions — if a constraint was never activated (0 activations), its violations are vacuous and can be disregarded. Select the constraints you want to investigate."
            : "This page shows deviations detected between your event log and the process model. Skipped activities (model moves) were expected by the model but did not occur. Inserted activities (log moves) occurred in the log at a positon in which they are not intended by the model. The bar indicates frequency. Select the deviations you want to investigate — only selected deviations will be analyzed in the following steps."
          }
          arrow
          placement="right"
        >
          <IconButton>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What you see</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {conformanceMode === 'declarative' || conformanceMode === 'declarative-model'
                ? "All violated DECLARE constraints detected in your event log, ordered by violation count. Each row represents one constraint. Constraints that were never activated (0 activations) are vacuous — their violations can generally be disregarded."
                : "All deviations detected between your event log and the process model, ordered by frequency. Skipped activities were expected by the model but did not occur in the log; inserted activities occurred in the log but are not expected by the model at that position."}
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Select the deviations you want to investigate. Only selected deviations will be carried forward into the causal analysis. Deviations with zero occurrences are disabled and cannot be selected.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              <strong>Tip:</strong> Deviations with very few occurrences may produce unreliable causal estimates — the small sample size makes it hard to substantiate any findings. Deviations below the threshold set below are pre-deselected by default. Consider focusing on deviations that appear more frequently for more robust results.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              <strong>Caution:</strong> Try not to deselect too many deviations. Only deselect deviations that occur so infrequently that they appear largely irrelevant — keeping more deviations selected generally leads to a more comprehensive and reliable analysis.
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Low-selection warning */}
      {selectedDeviations.length < 5 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You currently have only {selectedDeviations.length} deviation{selectedDeviations.length === 1 ? '' : 's'} selected. This may be too few for a comprehensive analysis — double-check whether you've deselected deviations that could still be relevant.
        </Alert>
      )}

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

      {/* MODEL VIEWER — PNML fallback (no Graphviz) */}
      {conformanceMode === 'bpmn' && modelType === 'pnml_info' && modelInfo && (
        <Paper sx={{ mb: 4, p: 2 }}>
          <Typography variant="h6" gutterBottom>Mined Process Model</Typography>
          <Box display="flex" gap={3} mb={2}>
            <Chip label={`${modelInfo.n_transitions} transitions`} size="small" variant="outlined" />
            <Chip label={`${modelInfo.n_places} places`} size="small" variant="outlined" />
            <Chip label={`${modelInfo.n_arcs} arcs`} size="small" variant="outlined" />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Activities in model ({modelInfo.activities.length}):
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {modelInfo.activities.map((act) => (
              <Chip key={act} label={act} size="small" sx={{ fontSize: 11 }} />
            ))}
          </Box>
        </Paper>
      )}

      {/* MODEL VIEWER — Declarative mode: constraint summary table */}
      {(conformanceMode === 'declarative' || conformanceMode === 'declarative-model') && modelConstraints.length > 0 && (
        <Paper sx={{ mb: 4, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            {conformanceMode === 'declarative-model'
              ? `Uploaded Declarative Model (${modelConstraints.length.toLocaleString()} constraints)`
              : `Mined Declarative Model (${modelConstraints.length.toLocaleString()} constraints)`}
          </Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Operand A</TableCell>
                  <TableCell>Operand B</TableCell>
                  {conformanceMode === 'declarative-model' && <TableCell>Activation (A.)</TableCell>}
                  {conformanceMode === 'declarative-model' && <TableCell>Target (T.)</TableCell>}
                  {conformanceMode === 'declarative-model' && <TableCell>Time Window</TableCell>}
                  {conformanceMode !== 'declarative-model' && <TableCell align="right">Support</TableCell>}
                  {conformanceMode !== 'declarative-model' && <TableCell align="right">Confidence</TableCell>}
                  {conformanceMode === 'declarative-model' && <TableCell align="right">Activations</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {modelConstraints.map((c: any, i: number) => {
                  const neverActivated = conformanceMode === 'declarative-model' && c.total_activations === 0;
                  return (
                    <TableRow key={i} sx={{ backgroundColor: neverActivated ? '#fafafa' : undefined }}>
                      <TableCell sx={{ fontSize: 11 }}>{c.type}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>
                        <Tooltip title={c.op_0} arrow placement="top">
                          <Box component="span" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>
                            {c.op_0}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ fontSize: 11 }}>
                        <Tooltip title={c.op_1 || '—'} arrow placement="top">
                          <Box component="span" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>
                            {c.op_1 || '—'}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      {conformanceMode === 'declarative-model' && (
                        <TableCell sx={{ fontSize: 10, maxWidth: 200 }}>
                          {c.activation_condition ? (
                            <Tooltip title={c.activation_condition} arrow placement="top">
                              <Box component="span" sx={{ color: '#e65100', cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 200, verticalAlign: 'middle' }}>
                                {c.activation_condition.length > 35 ? c.activation_condition.slice(0, 35) + '…' : c.activation_condition}
                              </Box>
                            </Tooltip>
                          ) : <Box component="span" sx={{ color: '#bbb' }}>—</Box>}
                        </TableCell>
                      )}
                      {conformanceMode === 'declarative-model' && (
                        <TableCell sx={{ fontSize: 10, maxWidth: 200 }}>
                          {c.correlation_condition ? (
                            <Tooltip title={c.correlation_condition} arrow placement="top">
                              <Box component="span" sx={{ color: '#6a1b9a', cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 200, verticalAlign: 'middle' }}>
                                {c.correlation_condition.length > 35 ? c.correlation_condition.slice(0, 35) + '…' : c.correlation_condition}
                              </Box>
                            </Tooltip>
                          ) : <Box component="span" sx={{ color: '#bbb' }}>—</Box>}
                        </TableCell>
                      )}
                      {conformanceMode === 'declarative-model' && (
                        <TableCell sx={{ fontSize: 10, maxWidth: 160 }}>
                          {c.time_condition ? (
                            <Tooltip title={`Raw: ${c.time_condition.raw}`} arrow placement="top">
                              <Box component="span" sx={{ color: '#01579b', cursor: 'default', whiteSpace: 'nowrap' }}>
                                ⏱ {formatTimeCondition(c.time_condition)}
                              </Box>
                            </Tooltip>
                          ) : <Box component="span" sx={{ color: '#bbb' }}>—</Box>}
                        </TableCell>
                      )}
                      {conformanceMode !== 'declarative-model' && <TableCell align="right" sx={{ fontSize: 11 }}>{(c.support * 100).toFixed(1)}%</TableCell>}
                      {conformanceMode !== 'declarative-model' && <TableCell align="right" sx={{ fontSize: 11 }}>{(c.confidence * 100).toFixed(1)}%</TableCell>}
                      {conformanceMode === 'declarative-model' && (
                        <TableCell align="right" sx={{ fontSize: 11, color: neverActivated ? '#9e9e9e' : undefined }}>
                          {neverActivated
                            ? <Tooltip title="Never activated — violations are vacuous" arrow><Box component="span" sx={{ color: '#bdbdbd' }}>0 ⚠</Box></Tooltip>
                            : c.total_activations?.toLocaleString('en-US') ?? '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* Auto-selection threshold control */}
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          backgroundColor: '#fafafa',
          border: '1px solid #e0e0e0',
          borderRadius: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Auto-select deviations that occur at least
        </Typography>
        <TextField
          type="number"
          size="small"
          value={threshold}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value)))}
          inputProps={{ min: 0, style: { width: 56, textAlign: 'center' } }}
        />
        <Typography variant="body2" color="text.secondary">
          times
        </Typography>
        <Tooltip title="Recomputes the current selection: deviations meeting this threshold will be selected, all others deselected." arrow>
          <span>
            <Button variant="outlined" size="small" onClick={applyThreshold} disabled={loading || (!data && !declarativeData)}>
              Apply threshold
            </Button>
          </span>
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

      {/* Declarative mode: constraint list (mined or uploaded model) */}
      {!loading && !error && (conformanceMode === 'declarative' || conformanceMode === 'declarative-model') && declarativeData && (
        <>
          {renderConstraintList(declarativeData.constraints)}
          {renderMatrixPreview()}
        </>
      )}

      {/* Low-selection confirmation dialog */}
      <Dialog open={lowSelectionWarningOpen} onClose={() => setLowSelectionWarningOpen(false)}>
        <DialogTitle>Few deviations selected</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have selected only {selectedDeviations.length} deviation{selectedDeviations.length === 1 ? '' : 's'}. This may be too few for a comprehensive analysis — consider going back and re-checking whether you've deselected deviations that could still be relevant.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLowSelectionWarningOpen(false)}>Go back</Button>
          <Button
            variant="contained"
            onClick={() => {
              setLowSelectionWarningOpen(false);
              navigate("/select-dimensions");
            }}
          >
            Continue anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviationOverview;
