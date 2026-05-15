import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CloseIcon from "@mui/icons-material/Close";
import InfoIcon from "@mui/icons-material/Info";
import { useLocation, useNavigate } from "react-router-dom";
import { useBottomNav } from "./BottomNavContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:1904";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CausalResult {
  deviation: string;
  dimension: string;
  ate: number;
  p_value: number;
  error?: string;
}

type CriticalityLevel =
  | "very negative"
  | "negative"
  | "slightly negative"
  | "neutral"
  | "slightly positive"
  | "positive"
  | "very positive";

interface CriticalityRule {
  min: number;
  max: number;
  label: CriticalityLevel;
}

interface CriticalityMap {
  [dimension: string]: CriticalityRule[];
}

interface PriorityItem {
  deviation: string;
  score: number;
  reasons: string[];
}

interface DevRule {
  conditions: { feature: string; op: string; value: number }[];
  prediction: number;
  support: number;
  precision: number;
  coverage: number;
}

interface RuleResult {
  rules: DevRule[];
  feature_importance: { feature: string; importance: number }[];
  total_traces: number;
  deviation_rate: number;
  n_features?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BINARY_DIMS = new Set(["outcome", "quality", "compliance"]);
const NEGATIVE_GOOD_DIMS = new Set(["time", "costs"]);
const DIM_NAMES_SET = new Set(["time", "costs", "quality", "outcome", "compliance"]);

const getCriticality = (value: number, rules: CriticalityRule[] = []): CriticalityLevel | null => {
  for (const rule of rules) {
    if (value >= rule.min && value < rule.max) return rule.label;
  }
  return null;
};

const getCriticalityColor = (label: CriticalityLevel | null): string => {
  switch (label) {
    case "very positive":     return "rgba(0,100,0,0.85)";
    case "positive":          return "rgba(76,175,80,0.75)";
    case "slightly positive": return "rgba(129,199,132,0.7)";
    case "neutral":           return "rgba(200,200,200,0.7)";
    case "slightly negative": return "rgba(255,183,77,0.75)";
    case "negative":          return "rgba(255,152,0,0.75)";
    case "very negative":     return "rgba(211,47,47,0.85)";
    default: return "#fff";
  }
};

const overallDirection = (score: number): "negative" | "positive" | "neutral" => {
  if (score > 0) return "negative";
  if (score < 0) return "positive";
  return "neutral";
};

const directionChipColor = (dir: "negative" | "positive" | "neutral"): "error" | "success" | "default" => {
  if (dir === "negative") return "error";
  if (dir === "positive") return "success";
  return "default";
};

const recommendationText = (dev: string, dir: "negative" | "positive" | "neutral"): string => {
  if (dir === "negative")
    return `"${dev}" has an overall negative impact on your process. Investigate its root causes and take steps to prevent or reduce its occurrence.`;
  if (dir === "positive")
    return `"${dev}" has an overall positive impact on your process. Understand why it occurs and consider institutionalizing it as a standard practice.`;
  return `"${dev}" has a neutral overall impact. No immediate action is required — monitor it periodically but deprioritize remediation.`;
};

const getDimInterpretation = (dim: string, ate: number): string => {
  if (!isFinite(ate)) return "–";
  const dimL = dim.toLowerCase();
  const isBinary = BINARY_DIMS.has(dimL);
  const isNegGood = NEGATIVE_GOOD_DIMS.has(dimL);
  const abs = Math.abs(ate);
  if (isBinary) {
    const pct = (abs * 100).toFixed(1);
    if (ate > 0) return `↑ +${pct}% probability of positive ${dim} (beneficial)`;
    if (ate < 0) return `↓ −${pct}% probability of positive ${dim} (harmful)`;
    return "No effect";
  }
  const fmt = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (isNegGood) {
    if (ate < 0) return `↓ −${fmt} units of ${dim} (beneficial — lower is better)`;
    if (ate > 0) return `↑ +${fmt} units of ${dim} (harmful — higher is worse)`;
  } else {
    if (ate > 0) return `↑ +${fmt} units of ${dim} (beneficial)`;
    if (ate < 0) return `↓ −${fmt} units of ${dim} (harmful)`;
  }
  return "No effect";
};

const computeBins = (values: number[], numBins = 12): { label: string; count: number }[] => {
  if (!values.length) return [];
  const min = values.reduce((a, b) => (b < a ? b : a), values[0]);
  const max = values.reduce((a, b) => (b > a ? b : a), values[0]);
  if (min === max) return [{ label: min.toLocaleString("en-US", { maximumFractionDigits: 2 }), count: values.length }];
  const binSize = (max - min) / numBins;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    label: (min + i * binSize).toLocaleString("en-US", { maximumFractionDigits: 1 }),
    count: 0,
  }));
  values.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / binSize), numBins - 1);
    bins[idx].count++;
  });
  return bins;
};

const pearsonCorr = (xs: number[], ys: number[]): number | null => {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? null : num / den;
};

const detectCategorical = (col: string, matrixRows: any[]): boolean => {
  if (DIM_NAMES_SET.has(col) || col === "trace_id" || col === "activities") return false;
  if (matrixRows.length === 0) return false;
  const firstVal = matrixRows.find((r) => r[col] !== null && r[col] !== undefined)?.[col];
  if (firstVal === undefined) return false;
  if (typeof firstVal === "number" || typeof firstVal === "boolean") return false;
  if (Array.isArray(firstVal)) return false;
  const vals = matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
  const unique = new Set(vals);
  return unique.size >= 2 && unique.size <= 20;
};

const ruleConditionsToText = (rule: DevRule): string => {
  return rule.conditions
    .map((c) => {
      if (Math.abs(c.value - 0.5) < 0.1) {
        const lastUs = c.feature.lastIndexOf("_");
        if (lastUs > 0) {
          const origCol = c.feature.slice(0, lastUs);
          const cat = c.feature.slice(lastUs + 1);
          return c.op === ">" ? `${origCol} = ${cat}` : `${origCol} ≠ ${cat}`;
        }
      }
      return `${c.feature} ${c.op} ${c.value}`;
    })
    .join(" AND ");
};

// ── Co-occurrence Matrix ────────────────────────────────────────────────────────

const DeviationCooccurrence: React.FC<{ priorityList: PriorityItem[]; matrixRows: any[] }> = ({
  priorityList,
  matrixRows,
}) => {
  const [open, setOpen] = useState(false);
  const devNames = priorityList.map((p) => p.deviation);

  if (devNames.length < 2 || matrixRows.length === 0) return null;

  const coOccurrence: Record<string, Record<string, number>> = {};
  devNames.forEach((a) => {
    coOccurrence[a] = {};
    const aTraces = matrixRows.filter((r) => r[a] === 1);
    const aCount = aTraces.length;
    devNames.forEach((b) => {
      if (a === b) { coOccurrence[a][b] = -1; return; }
      coOccurrence[a][b] = aCount > 0 ? aTraces.filter((r) => r[b] === 1).length / aCount : 0;
    });
  });

  const cellBg = (val: number): string => {
    if (val < 0) return "#f5f5f5";
    if (val <= 0.5) {
      const t = val / 0.5;
      return `rgba(255,${Math.round(255 - t * 103)},${Math.round(255 - t * 255)},0.85)`;
    }
    const t = (val - 0.5) / 0.5;
    return `rgba(${Math.round(255 - t * 44)},${Math.round(152 - t * 105)},${Math.round(t * 47)},0.85)`;
  };

  return (
    <Box sx={{ mb: 3, border: "1px solid #e0e0e0", borderRadius: 2, overflow: "hidden" }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        sx={{ px: 2, py: 1.5, backgroundColor: "#f5f5f5", cursor: "pointer", userSelect: "none" }}
        onClick={() => setOpen((o) => !o)}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Deviation Co-occurrence Matrix
          <Box component="span" sx={{ ml: 1, fontSize: 12, color: "text.secondary", fontWeight: 400 }}>
            P(B | A) — how often does B occur when A is present?
          </Box>
        </Typography>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {open && (
        <Box sx={{ p: 2, overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, backgroundColor: "#fafafa" }}>A \ B →</TableCell>
                {devNames.map((b) => (
                  <TableCell key={b} align="center"
                    sx={{ fontSize: 10, fontWeight: 700, backgroundColor: "#fafafa", whiteSpace: "nowrap" }}>
                    <Tooltip title={b} arrow>
                      <span>{b.length > 18 ? b.slice(0, 16) + "…" : b}</span>
                    </Tooltip>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {devNames.map((a) => (
                <TableRow key={a}>
                  <TableCell sx={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>
                    <Tooltip title={a} arrow>
                      <span>{a.length > 18 ? a.slice(0, 16) + "…" : a}</span>
                    </Tooltip>
                  </TableCell>
                  {devNames.map((b) => {
                    const val = coOccurrence[a][b];
                    const isDiag = a === b;
                    return (
                      <Tooltip
                        key={b}
                        title={isDiag ? "" : `${Math.round(val * 100)}% of traces with "${a}" also have "${b}"`}
                        arrow
                      >
                        <TableCell
                          align="center"
                          sx={{
                            fontSize: 11,
                            fontWeight: isDiag ? 400 : 600,
                            backgroundColor: isDiag ? "#f5f5f5" : cellBg(val),
                            color: !isDiag && val > 0.5 ? "white" : "inherit",
                          }}
                        >
                          {isDiag ? "—" : `${Math.round(val * 100)}%`}
                        </TableCell>
                      </Tooltip>
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

// ── Correlation overview (deviation vs all attributes) ────────────────────────

interface CorrelationOverviewProps {
  deviation: string;
  matrixRows: any[];
  matrixCols: string[];
  activeCorrelCol: string | null;
  onSelectCol: (col: string | null) => void;
}

const CorrelationOverview: React.FC<CorrelationOverviewProps> = ({
  deviation,
  matrixRows,
  matrixCols,
  activeCorrelCol,
  onSelectCol,
}) => {
  const [showOtherDevs, setShowOtherDevs] = useState(false);

  const orderedCols = matrixCols.length > 0 ? matrixCols : (matrixRows.length > 0 ? Object.keys(matrixRows[0]) : []);

  const isOtherDev = (col: string): boolean => {
    if (col === deviation || DIM_NAMES_SET.has(col)) return false;
    const vals = matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    return vals.length > 0 && vals.every((v) => v === 0 || v === 1);
  };

  const corrRows = orderedCols
    .filter((col) => {
      if (col === deviation || col === "trace_id" || col === "activities") return false;
      if (DIM_NAMES_SET.has(col)) return false;
      if (Array.isArray(matrixRows[0]?.[col])) return false;
      if (!showOtherDevs && isOtherDev(col)) return false;
      return matrixRows.some((r) => typeof r[col] === "number");
    })
    .map((col) => {
      const pairs = matrixRows.filter(
        (r) => typeof r[col] === "number" && (r[deviation] === 0 || r[deviation] === 1)
      );
      const xs = pairs.map((r) => r[col]);
      const ys = pairs.map((r) => r[deviation]);
      const r = pearsonCorr(xs, ys);
      return { col, r, n: pairs.length };
    })
    .filter((row) => row.r !== null)
    .sort((a, b) => Math.abs(b.r!) - Math.abs(a.r!));

  // Categorical attribute rows
  const catRows = orderedCols
    .filter((col) => {
      if (col === deviation || col === "trace_id" || col === "activities") return false;
      if (DIM_NAMES_SET.has(col)) return false;
      if (isOtherDev(col)) return false;
      return detectCategorical(col, matrixRows);
    })
    .map((col) => {
      const categories = Array.from(new Set(matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined)));
      const rates = categories.map((cat) => {
        const inCat = matrixRows.filter((r) => r[col] === cat);
        return inCat.length > 0 ? inCat.filter((r) => r[deviation] === 1).length / inCat.length : 0;
      });
      const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
      const minRate = rates.length > 0 ? Math.min(...rates) : 0;
      const n = matrixRows.filter((r) => r[col] !== null && r[col] !== undefined).length;
      return { col, maxRate, range: maxRate - minRate, n };
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.range - a.range);

  if (corrRows.length === 0 && catRows.length === 0) return null;

  const corrColor = (r: number | null): string => {
    if (r === null) return "#eee";
    const abs = Math.abs(r);
    if (abs > 0.5) return r > 0 ? "rgba(198,40,40,0.15)" : "rgba(21,101,192,0.15)";
    if (abs > 0.2) return r > 0 ? "rgba(230,81,0,0.1)" : "rgba(25,118,210,0.1)";
    return "transparent";
  };

  return (
    <Box sx={{ mt: 2, border: "1px solid #e0e0e0", borderRadius: 1, p: 2, backgroundColor: "#fafafe" }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">
          Attribute Correlations with <strong>{deviation}</strong>
          <Box component="span" sx={{ ml: 1, fontSize: 11, color: "text.secondary" }}>
            (click a row to explore)
          </Box>
        </Typography>
        <Button
          size="small"
          variant={showOtherDevs ? "contained" : "outlined"}
          disableElevation
          onClick={() => setShowOtherDevs((v) => !v)}
          sx={{ fontSize: 11 }}
        >
          {showOtherDevs ? "Hide other deviations" : "Show other deviations"}
        </Button>
      </Box>

      {corrRows.length > 0 && (
        <>
          <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
            <Typography variant="caption" color="text.secondary">Numeric attributes — Pearson r</Typography>
            <Tooltip title="Pearson correlation coefficient between this numeric attribute and the deviation (0/1). Values near ±1 indicate a strong linear association; near 0 means little linear relationship. Click a row to explore visually." arrow>
              <InfoIcon sx={{ fontSize: 13, color: "text.disabled", cursor: "help" }} />
            </Tooltip>
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                  <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Attribute</TableCell>
                  <TableCell align="center" sx={{ fontSize: 11, fontWeight: 700 }}>Pearson r</TableCell>
                  <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Strength</TableCell>
                  <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700 }}>n</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {corrRows.map(({ col, r, n }) => {
                  const abs = Math.abs(r!);
                  const strength = abs > 0.5 ? "strong" : abs > 0.2 ? "moderate" : "weak";
                  const active = activeCorrelCol === col;
                  return (
                    <TableRow
                      key={col}
                      onClick={() => onSelectCol(active ? null : col)}
                      sx={{
                        cursor: "pointer",
                        backgroundColor: active ? "#e3f2fd" : corrColor(r),
                        "&:hover": { backgroundColor: "#e8f4fd" },
                        outline: active ? "2px solid #1976d2" : "none",
                        outlineOffset: "-2px",
                      }}
                    >
                      <TableCell sx={{ fontSize: 11 }}>
                        {col === "trace_duration_seconds" ? "Duration (s)" : col}
                        {isOtherDev(col) && (
                          <Box component="span" sx={{ ml: 0.5, fontSize: 10, color: "#888" }}>(dev)</Box>
                        )}
                        {active && <Box component="span" sx={{ ml: 0.5, color: "#1976d2", fontSize: 11 }}>↑</Box>}
                      </TableCell>
                      <TableCell align="center" sx={{
                        fontSize: 11, fontWeight: 600,
                        color: r! > 0 ? "#c62828" : "#1565c0",
                      }}>
                        {r!.toFixed(3)}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: abs > 0.5 ? "#c62828" : abs > 0.2 ? "#e65100" : "#888" }}>
                        {strength}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 10, color: "text.secondary" }}>{n}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </>
      )}

      {catRows.length > 0 && (
        <Box sx={{ mt: corrRows.length > 0 ? 2 : 0 }}>
          <Box display="flex" alignItems="center" gap={0.5} mb={0.5} sx={{ mt: corrRows.length > 0 ? 1 : 0 }}>
            <Typography variant="caption" color="text.secondary">Categorical attributes — deviation rate range</Typography>
            <Tooltip title="For each category value of this attribute, the deviation rate is the fraction of traces in that category that have the deviation. The range shows [min rate, max rate] across all values — a wide range suggests this attribute differentiates deviant traces. Click a row to explore." arrow>
              <InfoIcon sx={{ fontSize: 13, color: "text.disabled", cursor: "help" }} />
            </Tooltip>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Attribute</TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 700 }}>Max dev rate</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Rate range</TableCell>
                <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700 }}>n</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {catRows.map(({ col, maxRate, range, n }) => {
                const active = activeCorrelCol === col;
                return (
                  <TableRow
                    key={col}
                    onClick={() => onSelectCol(active ? null : col)}
                    sx={{
                      cursor: "pointer",
                      backgroundColor: active ? "#e3f2fd" : "transparent",
                      "&:hover": { backgroundColor: "#e8f4fd" },
                      outline: active ? "2px solid #1976d2" : "none",
                      outlineOffset: "-2px",
                    }}
                  >
                    <TableCell sx={{ fontSize: 11 }}>
                      {col}
                      {active && <Box component="span" sx={{ ml: 0.5, color: "#1976d2", fontSize: 11 }}>↑</Box>}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: 11, fontWeight: 600 }}>
                      {(maxRate * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell sx={{ fontSize: 11 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{
                          height: 8, borderRadius: 1,
                          backgroundColor: "#ef5350", opacity: 0.7,
                          width: `${Math.max(4, range * 100)}%`,
                          minWidth: 4,
                        }} />
                        <Box component="span" sx={{ fontSize: 10, color: "text.secondary", whiteSpace: "nowrap" }}>
                          {(range * 100).toFixed(0)}pp
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: 10, color: "text.secondary" }}>{n}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

// ── Process Context Panel ─────────────────────────────────────────────────────

const ProcessContextPanel: React.FC<{ deviation: string; matrixRows: any[] }> = ({
  deviation,
  matrixRows,
}) => {
  const g0 = matrixRows.filter((r) => r[deviation] === 0);
  const g1 = matrixRows.filter((r) => r[deviation] === 1);

  const mean0 = g0.length > 0
    ? g0.reduce((s, r) => s + (Array.isArray(r.activities) ? r.activities.length : 0), 0) / g0.length
    : 0;
  const mean1 = g1.length > 0
    ? g1.reduce((s, r) => s + (Array.isArray(r.activities) ? r.activities.length : 0), 0) / g1.length
    : 0;

  const traceLengthData = [
    { label: "No deviation", mean: parseFloat(mean0.toFixed(1)) },
    { label: "Deviation", mean: parseFloat(mean1.toFixed(1)) },
  ];

  const allActivities = new Set<string>();
  matrixRows.forEach((r) => {
    if (Array.isArray(r.activities)) r.activities.forEach((a: string) => allActivities.add(a));
  });

  const hasActivities = allActivities.size > 0;
  const eps = 1e-9;

  const activityLifts = Array.from(allActivities).map((act) => {
    const rateWith = g1.length > 0
      ? g1.filter((r) => Array.isArray(r.activities) && r.activities.includes(act)).length / g1.length
      : 0;
    const rateWithout = g0.length > 0
      ? g0.filter((r) => Array.isArray(r.activities) && r.activities.includes(act)).length / g0.length
      : 0;
    return { act, lift: rateWith / (rateWithout + eps), rateWith, rateWithout };
  });

  const LIFT_CAP = 5;
  const top10 = activityLifts
    .sort((a, b) => Math.abs(b.lift - 1) - Math.abs(a.lift - 1))
    .slice(0, 10)
    .map((item) => {
      const clipped = item.lift > LIFT_CAP;
      return {
        label: clipped ? item.act + " ···" : item.act,
        lift: parseFloat(Math.min(item.lift, LIFT_CAP).toFixed(2)),
        liftActual: parseFloat(item.lift.toFixed(2)),
        rateWith: parseFloat((item.rateWith * 100).toFixed(1)),
        rateWithout: parseFloat((item.rateWithout * 100).toFixed(1)),
        clipped,
      };
    });

  const liftYAxisWidth = Math.min(
    Math.max(...top10.map((d) => d.label.length), 10) * 5 + 10,
    300
  );

  return (
    <Box sx={{ mt: 2, border: "1px solid #e0e0e0", borderRadius: 1, p: 2, backgroundColor: "#fafafe" }}>
      <Box display="flex" alignItems="center" gap={0.5} mb={1}>
        <Typography variant="subtitle2">Process Context</Typography>
        <Tooltip title="Compares traces with and without this deviation: average trace length and which activities are significantly more (or less) common when the deviation is present." arrow>
          <InfoIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>
      </Box>
      <Box display="flex" gap={3} flexWrap="wrap">
        <Box sx={{ flex: "0 1 220px", minWidth: 180 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Mean trace length (number of activities)
          </Typography>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={traceLengthData} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} width={30} />
              <RechartsTip formatter={(v: any) => [`${v} activities`, "Mean length"]} />
              <Bar dataKey="mean" radius={[2, 2, 0, 0]}>
                <Cell fill="#78909c" />
                <Cell fill="#ef5350" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>

        {hasActivities && top10.length > 0 && (
          <Box sx={{ flex: "1 1 300px", minWidth: 260 }}>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <Typography variant="caption" color="text.secondary">
                Activity association lift — red = more common with deviation, blue = less common
              </Typography>
              <Tooltip title={`Lift = (activity rate in deviant traces) ÷ (activity rate in conformant traces). Lift > 1 means the activity appears more often when the deviation is present. Bars are capped at ${LIFT_CAP}×; labels ending in "···" indicate the actual lift exceeded the cap — hover to see the true value.`} arrow>
                <InfoIcon sx={{ fontSize: 13, color: "text.disabled", cursor: "help", flexShrink: 0 }} />
              </Tooltip>
            </Box>
            <ResponsiveContainer width="100%" height={Math.max(160, top10.length * 26)}>
              <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, LIFT_CAP]}
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v) => v === LIFT_CAP ? `${LIFT_CAP}+` : v.toFixed(1)}
                />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 8 }} width={liftYAxisWidth} />
                <RechartsTip
                  formatter={(_v: any, _name: string, props: any) => {
                    const p = props.payload;
                    const liftStr = p.clipped ? `${p.liftActual} (capped at ${LIFT_CAP})` : p.liftActual.toFixed(2);
                    return [`${liftStr}  (with: ${p.rateWith}%, without: ${p.rateWithout}%)`, "Lift"];
                  }}
                />
                <Bar
                  dataKey="lift"
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    if (!width || !height) return <g />;
                    const fill = payload.liftActual > 1 ? "#ef5350" : "#1976d2";
                    if (!payload.clipped) {
                      return <rect x={x} y={y} width={width} height={height} fill={fill} opacity={0.75} rx={2} />;
                    }
                    // Broken-axis bar: draw bar + two diagonal slash marks in the middle
                    const bx = x + width * 0.52;
                    const sw = 5; // slash pair width
                    return (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill={fill} opacity={0.75} rx={2} />
                        <line x1={bx - sw} y1={y - 1} x2={bx + 1} y2={y + height + 1} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
                        <line x1={bx + 2} y1={y - 1} x2={bx + sw + 3} y2={y + height + 1} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
                      </g>
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ── Decision Rules Panel ──────────────────────────────────────────────────────

const DecisionRulesPanel: React.FC<{
  rulesData: RuleResult | null;
  rulesLoading: boolean;
  rulesError: string | null;
}> = ({ rulesData, rulesLoading, rulesError }) => {
  if (rulesLoading) {
    return (
      <Box display="flex" alignItems="center" gap={1} sx={{ mt: 2, p: 2 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">Extracting predictive rules…</Typography>
      </Box>
    );
  }
  if (rulesError) {
    return <Alert severity="warning" sx={{ mt: 2 }}>{rulesError}</Alert>;
  }
  if (!rulesData) return null;

  const { rules = [], feature_importance = [] } = rulesData;
  const topImportance = feature_importance.slice(0, 8);
  const topRules = rules.slice(0, 5);

  const condLabel = (c: DevRule["conditions"][0]): string => {
    if (Math.abs(c.value - 0.5) < 0.1) {
      const lastUs = c.feature.lastIndexOf("_");
      if (lastUs > 0) {
        const origCol = c.feature.slice(0, lastUs);
        const cat = c.feature.slice(lastUs + 1);
        return c.op === ">" ? `${origCol} = ${cat}` : `${origCol} ≠ ${cat}`;
      }
    }
    return `${c.feature} ${c.op} ${c.value}`;
  };

  return (
    <Box sx={{ mt: 2, border: "1px solid #e0e0e0", borderRadius: 1, p: 2, backgroundColor: "#fafafe" }}>
      <Typography variant="subtitle2" gutterBottom>Predictive Rules</Typography>

      {topImportance.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Feature Importance — top attributes explaining the deviation
          </Typography>
          <ResponsiveContainer width="100%" height={Math.max(100, topImportance.length * 24)}>
            <BarChart data={topImportance} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => v.toFixed(2)} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 8 }} width={130} />
              <RechartsTip formatter={(v: any) => [v.toFixed(4), "Importance"]} />
              <Bar dataKey="importance" fill="#7e57c2" radius={[0, 2, 2, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {topRules.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No predictive patterns found in the available attributes.
        </Typography>
      ) : (
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Top predictive rules (sorted by precision — how often the deviation is present when rule fires)
          </Typography>
          {topRules.map((rule, i) => (
            <Box
              key={i}
              sx={{
                mb: 1.5, p: 1.5, borderRadius: 1,
                backgroundColor: "rgba(239,83,80,0.04)",
                border: "1px solid rgba(239,83,80,0.2)",
              }}
            >
              <Box display="flex" flexWrap="wrap" gap={0.5} alignItems="center" mb={0.5}>
                {rule.conditions.map((c, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && (
                      <Chip label="AND" size="small" variant="outlined" sx={{ fontSize: 9, height: 18, px: 0 }} />
                    )}
                    <Chip
                      label={condLabel(c)}
                      size="small"
                      sx={{ fontSize: 10, backgroundColor: "#fff3e0", height: 22 }}
                    />
                  </React.Fragment>
                ))}
                <Box component="span" sx={{ ml: 0.5, fontSize: 10, color: "#888" }}>
                  → deviation likely
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {(rule.precision * 100).toFixed(0)}% precision · covers {(rule.coverage * 100).toFixed(0)}% of traces · {rule.support} trace{rule.support !== 1 ? "s" : ""}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ── Key Pattern Box ────────────────────────────────────────────────────────────

const KeyPatternBox: React.FC<{
  topRuleText: string | null;
  dir: "negative" | "positive" | "neutral";
}> = ({ topRuleText, dir }) => {
  if (!topRuleText || dir === "neutral") return null;
  if (dir === "negative") {
    return (
      <Alert severity="warning" icon={false} sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>⚠ Key risk pattern:</strong> This deviation is most likely when{" "}
          <strong>{topRuleText}</strong>. Focus prevention on these cases.
        </Typography>
      </Alert>
    );
  }
  return (
    <Alert severity="success" icon={false} sx={{ mb: 2 }}>
      <Typography variant="body2">
        <strong>✓ Success pattern:</strong> This beneficial deviation tends to occur when{" "}
        <strong>{topRuleText}</strong>. Consider formalizing this as a standard practice.
      </Typography>
    </Alert>
  );
};

// ── Root cause panel (per deviation × dimension) ──────────────────────────────

interface RootCausePanelProps {
  deviation: string;
  dimension: string;
  matrixRows: any[];
  matrixCols: string[];
  correlCol: string | null;
  onSetCorrelCol: (col: string | null) => void;
  onClose: () => void;
  onRulesLoaded: (text: string | null) => void;
}

const RootCausePanel: React.FC<RootCausePanelProps> = ({
  deviation,
  dimension,
  matrixRows,
  matrixCols,
  correlCol,
  onSetCorrelCol,
  onClose,
  onRulesLoaded,
}) => {
  const [rulesData, setRulesData] = useState<RuleResult | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviation) return;
    setRulesLoading(true);
    setRulesError(null);
    fetch(`${API_URL}/api/deviation-rules?deviation=${encodeURIComponent(deviation)}`)
      .then((r) => r.json())
      .then((data) => {
        setRulesData(data);
        const topRule = data.rules?.[0];
        onRulesLoaded(topRule && topRule.precision > 0.55 ? ruleConditionsToText(topRule) : null);
      })
      .catch(() => {
        setRulesError("Failed to extract predictive rules.");
        onRulesLoaded(null);
      })
      .finally(() => setRulesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviation]);

  const isBinaryDim = BINARY_DIMS.has(dimension.toLowerCase());

  const orderedCols = matrixCols.length > 0 ? matrixCols : (matrixRows.length > 0 ? Object.keys(matrixRows[0]) : []);

  const allDevCols = new Set(
    orderedCols.filter((col) => {
      if (DIM_NAMES_SET.has(col)) return false;
      const vals = matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
      return vals.length > 0 && vals.every((v) => v === 0 || v === 1);
    })
  );

  const traceTableCols = orderedCols.filter((col) => !allDevCols.has(col) || col === deviation);

  const canCorrel = (col: string) =>
    col !== dimension && col !== deviation && !Array.isArray(matrixRows[0]?.[col]) &&
    (matrixRows.some((r) => typeof r[col] === "number") || detectCategorical(col, matrixRows));

  const dimValues = matrixRows.map((r) => r[dimension]).filter((v): v is number => typeof v === "number");
  const devValues = matrixRows.map((r) => r[deviation]).filter((v) => v === 0 || v === 1);

  const sortedRows = [...matrixRows]
    .filter((row) => typeof row[dimension] === "number")
    .sort((a, b) => a[dimension] - b[dimension]);
  const bottomFive = sortedRows.slice(0, 5);
  const topFive = sortedRows.slice(-5).reverse();

  const isColNumerical = (col: string) => matrixRows.some((r) => typeof r[col] === "number");

  const renderActivityChevrons = (acts: string[]) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 0" }}>
      {acts.map((act, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <Box component="span" sx={{ mx: 0.4, color: "#bbb", fontSize: "10px" }}>›</Box>}
          <Box component="span" sx={{
            display: "inline-block", background: "#e3f2fd", color: "#1565c0",
            borderRadius: "3px", px: "4px", py: "1px", fontSize: "10px",
            whiteSpace: "nowrap", lineHeight: 1.5,
          }}>{act}</Box>
        </React.Fragment>
      ))}
    </Box>
  );

  const renderCellValue = (val: any) => {
    if (Array.isArray(val)) return renderActivityChevrons(val as string[]);
    if (typeof val === "number") return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return val ?? "–";
  };

  // Distribution chart for dimension
  const dimChart = isBinaryDim ? (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={[
          { label: "0 (negative)", count: dimValues.filter((v) => v === 0).length },
          { label: "1 (positive)", count: dimValues.filter((v) => v === 1).length },
        ]}
        margin={{ top: 4, right: 8, left: 0, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 9 }} width={28} />
        <RechartsTip formatter={(v: any) => [v, "traces"]} />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          <Cell fill="#ef5350" /><Cell fill="#66bb6a" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  ) : (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={computeBins(dimValues)} margin={{ top: 4, right: 8, left: 0, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 9 }} width={28} />
        <RechartsTip formatter={(v: any) => [v, "traces"]} />
        <Bar dataKey="count" fill="#1976d2" opacity={0.75} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // Correlation panel
  const renderCorrelation = () => {
    if (!correlCol) return null;
    if (Array.isArray(matrixRows[0]?.[correlCol]))
      return (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Correlation not available for activity sequence columns.
        </Typography>
      );

    // Categorical handling
    if (detectCategorical(correlCol, matrixRows)) {
      const categories = Array.from(
        new Set(matrixRows.map((r) => r[correlCol]).filter((v) => v !== null && v !== undefined))
      );
      const catBarData = categories
        .map((cat) => {
          const inCat = matrixRows.filter((r) => r[correlCol] === cat);
          const devRate = inCat.length > 0
            ? inCat.filter((r) => r[deviation] === 1).length / inCat.length
            : 0;
          return { label: String(cat), devRate: parseFloat(devRate.toFixed(4)), n: inCat.length };
        })
        .sort((a, b) => b.devRate - a.devRate);

      return (
        <Box sx={{ mt: 2, p: 2, border: "1px solid #e0e0e0", borderRadius: 1, backgroundColor: "#f9f9f9" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2">
              Deviation rate by <strong>{correlCol}</strong> value
            </Typography>
            <IconButton size="small" onClick={() => onSetCorrelCol(null)}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <ResponsiveContainer width="100%" height={Math.max(160, catBarData.length * 32)}>
            <BarChart data={catBarData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 9 }} width={44}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
              <RechartsTip
                formatter={(v: any, _name: string, props: any) => [
                  `${(v * 100).toFixed(1)}% (${props.payload.n} traces)`,
                  "Deviation rate",
                ]}
              />
              <Bar dataKey="devRate" radius={[2, 2, 0, 0]}>
                {catBarData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.devRate > 0.5 ? "#ef5350" : "#1976d2"} opacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      );
    }

    // Numeric handling
    if (!isColNumerical(correlCol)) return null;

    const g0 = matrixRows.filter((r) => r[deviation] === 0 && typeof r[correlCol] === "number");
    const g1 = matrixRows.filter((r) => r[deviation] === 1 && typeof r[correlCol] === "number");
    const mean0dev = g0.length ? g0.reduce((s, r) => s + r[correlCol], 0) / g0.length : 0;
    const mean1dev = g1.length ? g1.reduce((s, r) => s + r[correlCol], 0) / g1.length : 0;
    const devBars = [
      { label: "No deviation (0)", mean: mean0dev },
      { label: "Deviation (1)", mean: mean1dev },
    ];

    const pairsForDim = matrixRows.filter(
      (r) => typeof r[correlCol] === "number" && typeof r[dimension] === "number"
    );
    const r = pearsonCorr(pairsForDim.map((r) => r[correlCol]), pairsForDim.map((r) => r[dimension]));

    let dimCorrelChart: React.ReactNode;
    if (isBinaryDim) {
      const dg0 = matrixRows.filter((r) => r[dimension] === 0 && typeof r[correlCol] === "number");
      const dg1 = matrixRows.filter((r) => r[dimension] === 1 && typeof r[correlCol] === "number");
      const dmean0 = dg0.length ? dg0.reduce((s, r) => s + r[correlCol], 0) / dg0.length : 0;
      const dmean1 = dg1.length ? dg1.reduce((s, r) => s + r[correlCol], 0) / dg1.length : 0;
      dimCorrelChart = (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={[{ label: `${dimension}=0`, mean: dmean0 }, { label: `${dimension}=1`, mean: dmean1 }]}
            margin={{ top: 4, right: 8, left: 0, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 9 }} width={40} />
            <RechartsTip formatter={(v: any) => [v.toFixed(3), `Mean ${correlCol}`]} />
            <Bar dataKey="mean" radius={[2, 2, 0, 0]}>
              <Cell fill="#ef5350" /><Cell fill="#66bb6a" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    } else {
      const sample = pairsForDim.slice(0, 500).map((row) => ({ x: row[correlCol], y: row[dimension] }));
      dimCorrelChart = (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" name={correlCol} tick={{ fontSize: 9 }}
                label={{ value: correlCol, position: "insideBottom", offset: -12, fontSize: 9 }} />
              <YAxis dataKey="y" type="number" name={dimension} tick={{ fontSize: 9 }} width={40} />
              <ZAxis range={[18, 18]} />
              <RechartsTip cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: any, n: string) => [v.toLocaleString("en-US", { maximumFractionDigits: 2 }), n]} />
              <Scatter data={sample} fill="#1976d2" opacity={0.45} />
            </ScatterChart>
          </ResponsiveContainer>
          {pairsForDim.length > 500 && (
            <Typography variant="caption" color="text.secondary">
              Showing 500 of {pairsForDim.length} traces.
            </Typography>
          )}
        </>
      );
    }

    return (
      <Box sx={{ mt: 2, p: 2, border: "1px solid #e0e0e0", borderRadius: 1, backgroundColor: "#f9f9f9" }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle2">
            Correlation: <strong>{correlCol}</strong> vs deviation and dimension
            {r !== null && (
              <Box component="span" sx={{ ml: 1, fontSize: 12, color: Math.abs(r) > 0.5 ? "#c62828" : Math.abs(r) > 0.2 ? "#e65100" : "#555" }}>
                (Pearson r = {r.toFixed(3)} with {dimension})
              </Box>
            )}
          </Typography>
          <IconButton size="small" onClick={() => onSetCorrelCol(null)}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Box display="flex" gap={3} flexWrap="wrap">
          <Box sx={{ flex: "1 1 200px", minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Mean <strong>{correlCol}</strong> by <strong>{deviation}</strong>
            </Typography>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={devBars} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} width={40} />
                <RechartsTip formatter={(v: any) => [v.toFixed(3), `Mean ${correlCol}`]} />
                <Bar dataKey="mean" radius={[2, 2, 0, 0]}>
                  <Cell fill="#78909c" /><Cell fill="#ef5350" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Box sx={{ flex: "1 1 200px", minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              <strong>{correlCol}</strong> vs <strong>{dimension}</strong>
              {isBinaryDim ? " (mean by group)" : " (scatter)"}
            </Typography>
            {dimCorrelChart}
          </Box>
        </Box>
      </Box>
    );
  };

  const TraceTable = ({ label, rows, headerColor }: { label: string; rows: any[]; headerColor: string }) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" gutterBottom>{label}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Click a column header to explore its correlation with the dimension and deviation.
      </Typography>
      <Box sx={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: 500 }}>
          <TableHead>
            <TableRow>
              {traceTableCols.map((col) => {
                const clickable = canCorrel(col);
                const active = correlCol === col;
                return (
                  <TableCell
                    key={col}
                    onClick={clickable ? () => onSetCorrelCol(active ? null : col) : undefined}
                    sx={{
                      fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                      backgroundColor: active ? "#e3f2fd" : headerColor,
                      cursor: clickable ? "pointer" : "default",
                      userSelect: "none",
                      "&:hover": clickable ? { backgroundColor: "#bbdefb" } : {},
                      borderBottom: active ? "2px solid #1976d2" : undefined,
                    }}
                  >
                    {col === "trace_duration_seconds" ? "Duration (s)" : col}
                    {active && <Box component="span" sx={{ ml: 0.5, color: "#1976d2" }}>↑</Box>}
                    {clickable && !active && <Box component="span" sx={{ ml: 0.5, color: "#bbb", fontSize: 9 }}>~</Box>}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx} sx={{ "&:nth-of-type(even)": { backgroundColor: "#fafafa" } }}>
                {traceTableCols.map((col) => (
                  <TableCell key={col} sx={{ fontSize: 10, verticalAlign: "middle" }}>
                    {col === deviation
                      ? row[col] === 1
                        ? <Box component="span" sx={{ color: "#c62828", fontWeight: 700 }}>✓</Box>
                        : "–"
                      : renderCellValue(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ border: "1px solid #e0e0e0", borderRadius: 2, p: 3, mt: 2, backgroundColor: "#fafafa" }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Root Cause Analysis</Typography>
          <Box display="flex" gap={1}>
            <Chip label={`Dimension: ${dimension}`} size="small" color="primary" variant="outlined" />
            <Chip label={`Deviation: ${deviation}`} size="small" color="warning" variant="outlined" />
            <Chip label={`${matrixRows.length} traces`} size="small" variant="outlined" />
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      {/* Distribution charts */}
      <Box display="flex" gap={4} flexWrap="wrap" mb={2}>
        <Box sx={{ flex: "1 1 260px", minWidth: 220 }}>
          <Typography variant="subtitle2" gutterBottom>
            Distribution of <em>{dimension}</em>
            {isBinaryDim ? " (binary)" : ` — ${dimValues.length} values`}
          </Typography>
          {dimChart}
        </Box>
        <Box sx={{ flex: "0 1 200px", minWidth: 160 }}>
          <Typography variant="subtitle2" gutterBottom>
            Distribution of <em>{deviation}</em>
          </Typography>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={[
                { label: "0 — no deviation", count: devValues.filter((v) => v === 0).length },
                { label: "1 — deviation", count: devValues.filter((v) => v === 1).length },
              ]}
              margin={{ top: 4, right: 8, left: 0, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} width={28} />
              <RechartsTip formatter={(v: any) => [v, "traces"]} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                <Cell fill="#78909c" /><Cell fill="#ef5350" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Box>

      {/* Frequently co-occurring deviations */}
      {(() => {
        const devTraces = matrixRows.filter((r) => r[deviation] === 1);
        if (devTraces.length === 0) return null;
        const coDevs = Array.from(allDevCols)
          .filter((col) => col !== deviation)
          .map((col) => ({
            col,
            rate: devTraces.filter((r) => r[col] === 1).length / devTraces.length,
          }))
          .filter((x) => x.rate >= 0.5)
          .sort((a, b) => b.rate - a.rate);
        if (coDevs.length === 0) return null;
        return (
          <Box sx={{ mb: 2, p: 2, border: "1px solid #ffe082", borderRadius: 1, backgroundColor: "#fff8e1" }}>
            <Typography variant="subtitle2" gutterBottom>
              Frequently Co-occurring Deviations
              <Box component="span" sx={{ ml: 1, fontSize: 12, color: "text.secondary", fontWeight: 400 }}>
                other deviations present in ≥50% of traces that contain <em>{deviation}</em>
              </Box>
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
              {coDevs.map(({ col, rate }) => (
                <Chip
                  key={col}
                  label={`${col}  ${Math.round(rate * 100)}%`}
                  size="small"
                  sx={{ fontSize: 11, backgroundColor: "#ffe082", color: "#5d4037", maxWidth: 360 }}
                  title={col}
                />
              ))}
            </Box>
          </Box>
        );
      })()}

      {/* Feature 3: Process Context */}
      <ProcessContextPanel deviation={deviation} matrixRows={matrixRows} />

      {/* Feature 4: Predictive Rules */}
      <DecisionRulesPanel rulesData={rulesData} rulesLoading={rulesLoading} rulesError={rulesError} />

      {/* Feature 2: Correlation overview — all attributes */}
      <CorrelationOverview
        deviation={deviation}
        matrixRows={matrixRows}
        matrixCols={matrixCols}
        activeCorrelCol={correlCol}
        onSelectCol={onSetCorrelCol}
      />

      {renderCorrelation()}

      <Divider sx={{ my: 2 }} />

      <TraceTable label={`5 Traces with Lowest ${dimension}`} rows={bottomFive} headerColor="#e3f2fd" />
      <TraceTable label={`5 Traces with Highest ${dimension}`} rows={topFive} headerColor="#fce4ec" />
    </Box>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const Recommendations: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setContinue } = useBottomNav();

  const results: CausalResult[] = location.state?.results || [];
  const criticalityMap: CriticalityMap = location.state?.criticalityMap || {};
  const priorityList: PriorityItem[] = location.state?.priorityList || [];

  // Editable copy of priorityList — preserve the manual order set on screen 5
  const [editList, setEditList] = useState<PriorityItem[]>([...priorityList]);

  const updateScore = (deviation: string, newScore: number) => {
    setEditList((prev) =>
      [...prev.map((item) => item.deviation === deviation ? { ...item, score: newScore } : item)]
        .sort((a, b) => b.score - a.score)
    );
  };

  const [matrixRows, setMatrixRows] = useState<any[]>([]);
  const [matrixCols, setMatrixCols] = useState<string[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixFetched, setMatrixFetched] = useState(false);

  // Which deviation card is expanded to show root cause
  const [expandedDevs, setExpandedDevs] = useState<Set<string>>(new Set());
  // Selected dimension for root cause per deviation
  const [selectedDimPerDev, setSelectedDimPerDev] = useState<{ [dev: string]: string }>({});
  // Selected correlation column: key = `${dev}::${dim}`
  const [correlCols, setCorrelCols] = useState<{ [key: string]: string | null }>({});
  // Top rule text per deviation (for KeyPatternBox — Feature 9)
  const [topRuleTexts, setTopRuleTexts] = useState<{ [dev: string]: string | null }>({});

  useEffect(() => {
    if (matrixFetched) return;
    setMatrixLoading(true);
    fetch(`${API_URL}/api/current-impact-matrix`)
      .then((r) => r.json())
      .then((data) => {
        setMatrixRows(data.rows ?? []);
        setMatrixCols(data.columns ?? []);
        setMatrixFetched(true);
      })
      .catch(() => {})
      .finally(() => setMatrixLoading(false));
  }, [matrixFetched]);

  useEffect(() => {
    setContinue({ label: "Back to Start", onClick: () => navigate("/") });
    return () => setContinue(null);
  }, [navigate, setContinue]);

  const toggleExpand = (dev: string) => {
    setExpandedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(dev)) {
        next.delete(dev);
      } else {
        next.add(dev);
        if (!selectedDimPerDev[dev]) {
          const dims = results.filter((r) => r.deviation === dev && r.ate !== undefined).map((r) => r.dimension);
          if (dims.length > 0) {
            setSelectedDimPerDev((p) => ({ ...p, [dev]: dims[0] }));
          }
        }
      }
      return next;
    });
  };

  // ── Exports ──────────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const dims = Array.from(new Set(results.map((r) => r.dimension)));

    // Priority + ATE table
    let csv = "Rank,Deviation,Priority Score,Recommendation\n";
    editList.forEach((item, idx) => {
      const dir = overallDirection(item.score);
      csv += `${idx + 1},"${item.deviation}",${item.score},${dir === "negative" ? "Avoid" : dir === "positive" ? "Adopt" : "Ignore"}\n`;
    });

    csv += "\nATE Table\nDeviation," + dims.join(",") + "\n";
    editList.forEach((item) => {
      const cells = dims.map((dim) => {
        const r = results.find((x) => x.deviation === item.deviation && x.dimension === dim);
        return r?.ate != null ? r.ate.toFixed(2) : "";
      });
      csv += `"${item.deviation}",${cells.join(",")}\n`;
    });

    // Co-occurrence (≥50%)
    if (matrixRows.length > 0) {
      const allDevCols = matrixCols.filter((col) => {
        const vals = matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
        return vals.length > 0 && vals.every((v) => v === 0 || v === 1);
      });
      csv += "\nFrequently Co-occurring Deviations (≥50%)\nDeviation,Co-occurring Deviations\n";
      editList.forEach((item) => {
        const devTraces = matrixRows.filter((r) => r[item.deviation] === 1);
        if (!devTraces.length) return;
        const coDevs = allDevCols
          .filter((col) => col !== item.deviation)
          .map((col) => ({ col, rate: devTraces.filter((r) => r[col] === 1).length / devTraces.length }))
          .filter((x) => x.rate >= 0.5)
          .sort((a, b) => b.rate - a.rate)
          .map((x) => `${x.col} (${Math.round(x.rate * 100)}%)`)
          .join("; ");
        csv += `"${item.deviation}","${coDevs}"\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recommendations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const dims = Array.from(new Set(results.map((r) => r.dimension)));

    // ── Cover header ──────────────────────────────────────────────────────────
    doc.setFontSize(16);
    doc.text("Process Deviation Recommendations", 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);

    // ── 1. Priority overview table ────────────────────────────────────────────
    doc.setFontSize(12);
    doc.text("1. Priority Overview", 14, 32);
    autoTable(doc, {
      startY: 36,
      head: [["Rank", "Deviation", "Score", "Action", ...dims]],
      body: editList.map((item, idx) => {
        const dir = overallDirection(item.score);
        const dimCells = dims.map((dim) => {
          const r = results.find((x) => x.deviation === item.deviation && x.dimension === dim);
          return r?.ate != null ? r.ate.toFixed(2) : "–";
        });
        return [
          idx + 1,
          item.deviation,
          item.score,
          dir === "negative" ? "Avoid" : dir === "positive" ? "Adopt" : "Ignore",
          ...dimCells,
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    // ── 2. Co-occurrence table ─────────────────────────────────────────────────
    if (matrixRows.length > 0) {
      const allDevCols = matrixCols.filter((col) => {
        const vals = matrixRows.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
        return vals.length > 0 && vals.every((v) => v === 0 || v === 1);
      });
      const coRows = editList.map((item) => {
        const devTraces = matrixRows.filter((r) => r[item.deviation] === 1);
        if (!devTraces.length) return [item.deviation, "–"];
        const coDevs = allDevCols
          .filter((col) => col !== item.deviation)
          .map((col) => ({ col, rate: devTraces.filter((r) => r[col] === 1).length / devTraces.length }))
          .filter((x) => x.rate >= 0.5)
          .sort((a, b) => b.rate - a.rate)
          .map((x) => `${x.col} (${Math.round(x.rate * 100)}%)`)
          .join(", ");
        return [item.deviation, coDevs || "none"];
      });

      const coStartY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("2. Deviation Co-occurrence (≥50%)", 14, coStartY);
      autoTable(doc, {
        startY: coStartY + 4,
        head: [["Deviation", "Co-occurring Deviations"]],
        body: coRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 66, 66] },
      });
    }

    // ── 3. Per-deviation detail pages ─────────────────────────────────────────
    editList.forEach((item, idx) => {
      doc.addPage();
      const dir = overallDirection(item.score);
      const action = dir === "negative" ? "Avoid" : dir === "positive" ? "Adopt" : "Monitor";

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Deviation: ${item.deviation}`, 14, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Action: ${action}   |   Priority Score: ${item.score}   |   Rank: ${idx + 1}`, 14, 25);
      const recLines = doc.splitTextToSize(recommendationText(item.deviation, dir), 182);
      doc.text(recLines, 14, 31);

      // Key impacts line
      if (item.reasons.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        const impactLine = doc.splitTextToSize(`Key impacts: ${item.reasons.join(" · ")}`, 182);
        doc.text(impactLine, 14, 31 + recLines.length * 5);
        doc.setTextColor(0);
      }

      const causalStartY = 31 + recLines.length * 5 + (item.reasons.length > 0 ? 10 : 6);

      // Causal effects table
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Causal Effects per Dimension", 14, causalStartY);
      doc.setFont("helvetica", "normal");
      const causalRows = results
        .filter((r) => r.deviation === item.deviation && isFinite(r.ate))
        .map((r) => [
          r.dimension,
          r.ate.toFixed(3),
          r.p_value?.toFixed(3) ?? "–",
          getCriticality(r.ate, criticalityMap[r.dimension]) ?? "–",
          getDimInterpretation(r.dimension, r.ate),
        ]);
      autoTable(doc, {
        startY: causalStartY + 4,
        head: [["Dimension", "ATE", "p-value", "Criticality", "Interpretation"]],
        body: causalRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [80, 80, 80] },
        columnStyles: { 4: { cellWidth: 65 } },
      });

      let curY = (doc as any).lastAutoTable.finalY + 10;

      // Key predictive pattern
      const topRule = topRuleTexts[item.deviation];
      if (topRule) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Key Predictive Pattern", 14, curY);
        doc.setFont("helvetica", "normal");
        curY += 5;
        doc.setFontSize(8);
        const ruleLines = doc.splitTextToSize(topRule, 182);
        doc.text(ruleLines, 14, curY);
        curY += ruleLines.length * 4 + 8;
      }

    });

    doc.save("recommendations.pdf");
  };

  if (editList.length === 0) {
    return (
      <Box sx={{ width: "100%", mt: 4 }}>
        <Typography variant="h5" mb={3}>Root Cause Investigation</Typography>
        <Alert severity="warning">
          No analysis data found. Please go back and complete the causal analysis first.
        </Alert>
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate("/")}>
          Back to Start
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", margin: "0 auto", mt: 4 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center">
          <Typography variant="h5">Root Cause Investigation</Typography>
          <Tooltip
            title="Each deviation is analysed individually based on its causal impact across all selected dimensions. Negative deviations (overall harmful) should be avoided; positive ones (overall beneficial) should be adopted; neutral ones can be ignored. Expand a card to investigate root causes per dimension using distribution charts, correlation plots, and trace-level detail."
            arrow
            placement="right"
          >
            <IconButton size="small" sx={{ ml: 1 }}>
              <InfoIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box display="flex" gap={1}>
          <Button size="small" variant="outlined" onClick={exportCSV}>Export CSV</Button>
          <Button size="small" variant="outlined" onClick={exportPDF}>Export PDF</Button>
        </Box>
      </Box>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What you see</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              One card per selected deviation, ranked by overall negative impact (most harmful first). Each card summarises the causal effects on all dimensions and shows whether the deviation should be avoided, adopted, or ignored.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Review the ranking and adjust priority scores to re-order cards if needed. Expand any card to investigate root causes for a specific dimension — including correlation patterns, trace-level data, and predictive rules.
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>

      {matrixLoading && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">Loading trace data…</Typography>
        </Box>
      )}

      {/* Feature 1: Co-occurrence Matrix */}
      {matrixRows.length > 0 && (
        <DeviationCooccurrence priorityList={editList} matrixRows={matrixRows} />
      )}

      {editList.map((item, rank) => {
        const dir = overallDirection(item.score);
        const dimsForDev = results
          .filter((r) => r.deviation === item.deviation && isFinite(r.ate))
          .map((r) => r.dimension);
        const isExpanded = expandedDevs.has(item.deviation);
        const activeDim = selectedDimPerDev[item.deviation] || dimsForDev[0] || "";
        const correlKey = `${item.deviation}::${activeDim}`;

        const borderColor =
          dir === "negative" ? "#ef5350" : dir === "positive" ? "#66bb6a" : "#bdbdbd";
        const headerBg =
          dir === "negative" ? "rgba(239,83,80,0.06)" : dir === "positive" ? "rgba(102,187,106,0.06)" : "rgba(0,0,0,0.03)";

        return (
          <Card
            key={item.deviation}
            sx={{ mb: 3, borderLeft: `4px solid ${borderColor}`, borderRadius: 2 }}
            variant="outlined"
          >
            <CardContent sx={{ backgroundColor: headerBg, pb: isExpanded ? 1 : 2 }}>
              {/* Card header */}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                <Box>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    <Typography variant="h6" sx={{ fontSize: "1rem" }}>
                      #{rank + 1} — {item.deviation}
                    </Typography>
                    <Chip
                      label={dir === "negative" ? "Avoid" : dir === "positive" ? "Adopt" : "Ignore"}
                      color={directionChipColor(dir)}
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                    <Tooltip title="Edit priority score to re-rank deviations" arrow>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Score:</Typography>
                        <TextField
                          type="number"
                          size="small"
                          defaultValue={item.score}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) updateScore(item.deviation, val);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          inputProps={{ style: { fontSize: 12, padding: '2px 6px', width: 56 } }}
                          sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Box>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {recommendationText(item.deviation, dir)}
                  </Typography>
                  {item.reasons.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      Key impacts: {item.reasons.join(" · ")}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Per-dimension impact table */}
              <Box sx={{ mt: 2, overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "rgba(0,0,0,0.03)" }}>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Dimension</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="center">ATE</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="center">p-value</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="center">Criticality</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Interpretation</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results
                      .filter((r) => r.deviation === item.deviation)
                      .map((r) => {
                        const label = getCriticality(r.ate, criticalityMap[r.dimension]);
                        const bgColor = getCriticalityColor(label);
                        const interp = getDimInterpretation(r.dimension, r.ate);
                        return (
                          <TableRow key={r.dimension}>
                            <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>{r.dimension}</TableCell>
                            <TableCell align="center" sx={{ fontSize: 11 }}>
                              {isFinite(r.ate)
                                ? r.ate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "–"}
                            </TableCell>
                            <TableCell align="center" sx={{ fontSize: 11 }}>
                              {r.p_value !== undefined ? r.p_value.toFixed(3) : "–"}
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ fontSize: 11, backgroundColor: bgColor, color: "white", fontWeight: 500 }}
                            >
                              {label ?? "–"}
                            </TableCell>
                            <TableCell sx={{ fontSize: 11 }}>{interp}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Box>

              {/* Expand/collapse root cause */}
              {dimsForDev.length > 0 && (
                <Box mt={1.5}>
                  <Button
                    size="small"
                    variant={isExpanded ? "contained" : "outlined"}
                    startIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => toggleExpand(item.deviation)}
                    disableElevation
                  >
                    {isExpanded ? "Hide Root Cause Analysis" : "Investigate Root Causes"}
                  </Button>
                </Box>
              )}
            </CardContent>

            {/* Root cause panel */}
            {isExpanded && (
              <CardContent sx={{ pt: 0 }}>
                {/* Dimension selector */}
                {dimsForDev.length > 1 && (
                  <FormControl size="small" sx={{ mt: 1, mb: 1, minWidth: 200 }}>
                    <InputLabel sx={{ fontSize: 12 }}>Select dimension</InputLabel>
                    <Select
                      value={activeDim}
                      label="Select dimension"
                      onChange={(e) =>
                        setSelectedDimPerDev((p) => ({ ...p, [item.deviation]: e.target.value }))
                      }
                      sx={{ fontSize: 12 }}
                    >
                      {dimsForDev.map((d) => (
                        <MenuItem key={d} value={d} sx={{ fontSize: 12 }}>{d}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {/* Feature 9: Key Pattern Box */}
                <KeyPatternBox
                  topRuleText={topRuleTexts[item.deviation] ?? null}
                  dir={dir}
                />

                {activeDim && matrixRows.length > 0 ? (
                  <RootCausePanel
                    deviation={item.deviation}
                    dimension={activeDim}
                    matrixRows={matrixRows}
                    matrixCols={matrixCols}
                    correlCol={correlCols[correlKey] ?? null}
                    onSetCorrelCol={(col) =>
                      setCorrelCols((prev) => ({ ...prev, [correlKey]: col }))
                    }
                    onClose={() => toggleExpand(item.deviation)}
                    onRulesLoaded={(text) =>
                      setTopRuleTexts((prev) => ({ ...prev, [item.deviation]: text }))
                    }
                  />
                ) : matrixRows.length === 0 && !matrixLoading ? (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Trace data not available. The impact matrix may have been cleared.
                  </Alert>
                ) : (
                  <Box display="flex" alignItems="center" gap={1} sx={{ mt: 2 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption">Loading trace data…</Typography>
                  </Box>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </Box>
  );
};

export default Recommendations;
