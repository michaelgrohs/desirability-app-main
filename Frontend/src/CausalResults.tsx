import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Table,
  Divider,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Slider,
  Button,
  Tooltip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { useLocation, useNavigate } from "react-router-dom";
import { useFileContext } from "./FileContext";
import { useBottomNav } from "./BottomNavContext";

const API_URL = process.env.REACT_APP_API_URL;

interface CausalResult {
  deviation: string;
  dimension: string;
  ate: number;
  p_value: number | null;
  method?: string;           // "ate_cate" | "direct_time_cost"
  n_traces?: number;
  // CATE (length-matched subset)
  cate?: number | null;
  cate_p_value?: number | null;
  cate_n_traces?: number | null;
  cate_length_range?: [number, number] | null;
  cate_error?: string | null;
  // direct time-cost attribution
  total_cost?: number;
  mean_cost_violated?: number;
  n_traces_with_cost?: number;
  n_violations?: number;
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

const ALL_LEVELS: CriticalityLevel[] = [
  "very negative",
  "negative",
  "slightly negative",
  "neutral",
  "slightly positive",
  "positive",
  "very positive",
];

const LEVEL_ORDER: CriticalityLevel[] = [
  "very negative",
  "negative",
  "slightly negative",
  "neutral",
  "slightly positive",
  "positive",
  "very positive",
];

interface CriticalityRule {
  min: number;
  max: number;
  label: CriticalityLevel;
}

interface CriticalityMap {
  [dim: string]: CriticalityRule[];
}

// Dimensions where ATE represents a probability change (0–1 scale, binary outcome)
const BINARY_DIMENSIONS = new Set(["outcome", "compliance", "quality"]);

const capDim = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const getAteTooltip = (dimension: string, deviation: string, ate: number): string => {
  if (!isFinite(ate)) return "";
  const dimLower = dimension.toLowerCase();
  const isBinary = BINARY_DIMENSIONS.has(dimLower);
  const direction = ate < 0 ? "decreased" : "increased";
  const absAte = Math.abs(ate);

  if (isBinary) {
    const pct = (absAte * 100).toLocaleString('en-US', { maximumFractionDigits: 1 });
    return `ATE: the likelihood of a positive ${dimension} is ${direction} on average by ${pct}% if "${deviation}" happens (global, all traces).`;
  } else {
    const fmtAbs = absAte.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const fmtAte = ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `ATE = ${fmtAte}. ${dimension} is ${direction} by ${fmtAbs} on average whenever "${deviation}" occurs (global, all traces).`;
  }
};

const levelColor = (level: CriticalityLevel) => {
  switch (level) {
    case "very negative":      return "rgba(211,47,47,1)";
    case "negative":           return "rgba(255,152,0,1)";
    case "slightly negative":  return "rgba(255,183,77,1)";
    case "neutral":            return "rgba(200,200,200,1)";
    case "slightly positive":  return "rgba(129,199,132,1)";
    case "positive":           return "rgba(76,175,80,1)";
    case "very positive":      return "rgba(0,100,0,1)";
    default:                   return "#ccc";
  }
};

const CausalResults: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setContinue } = useBottomNav();

  const { selectedDeviations, resetAll } = useFileContext();

  const handleReset = () => {
    resetAll();
    navigate("/");
  };

  const selectedDimensions = location.state?.selectedDimensions || [];
  const results: CausalResult[] = location.state?.results || [];

  // selected levels per dimension (ordered in LEVEL_ORDER)
  const [selectedLevels, setSelectedLevels] = React.useState<{
    [dimension: string]: CriticalityLevel[];
  }>({});

  // boundaries per dimension = cut points between levels
  const [boundaries, setBoundaries] = useState<{
    [dim: string]: number[];
  }>({});

  // per-dimension: which basis (ate|cate) to use for criticality thresholds
  const [criticalityBasis, setCriticalityBasis] = useState<{ [dim: string]: 'ate' | 'cate' }>({});

  const getCellColor = (dimension: string, ate: number, maxAbs: number) => {
    if (ate === undefined || maxAbs === 0) return "#fff";
    const intensity = Math.max(Math.min(Math.abs(ate) / maxAbs, 1), 0.15);
    const isNegativeGood = ["time", "costs"].includes(dimension.toLowerCase());
    const isPositiveGood = ["outcome", "quality", "compliance"].includes(dimension.toLowerCase());
    let isGood = false;
    if (isNegativeGood) isGood = ate < 0;
    else if (isPositiveGood) isGood = ate > 0;
    else isGood = ate > 0;
    return isGood ? `rgba(76,175,80,${intensity})` : `rgba(211,47,47,${intensity})`;
  };

  const isNegativeGoodDim = (dim: string) =>
    ["time", "costs"].includes(dim.toLowerCase());

  const levelsForDim = (dim: string) => {
    const lvls = selectedLevels[dim] || [];
    return isNegativeGoodDim(dim) ? [...lvls].reverse() : lvls;
  };

  const sortedCutsForDim = (dim: string) => {
    const cuts = boundaries[dim] || [];
    return [...cuts].sort((a, b) => a - b);
  };

  const maxAbsEffect = React.useMemo(() => {
    if (!results.length) return 1;
    return Math.max(...results.map((r) => Math.abs(r.ate ?? 0)), 1);
  }, [results]);

  const maxAbsCateEffect = React.useMemo(() => {
    const vals = results.filter((r) => r.cate != null).map((r) => Math.abs(r.cate!));
    return Math.max(...vals, 1);
  }, [results]);

  const dimensions = React.useMemo(
    () => Array.from(new Set(results.map((r) => r.dimension))),
    [results]
  );
  const deviations = React.useMemo(
    () => Array.from(new Set(results.map((r) => r.deviation))),
    [results]
  );

  // default selected levels = all, ordered
  useEffect(() => {
    if (!dimensions.length) return;
    setSelectedLevels((prev) => {
      let changed = false;
      const updated = { ...prev };
      dimensions.forEach((dim) => {
        if (!updated[dim]) {
          updated[dim] = [...LEVEL_ORDER];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [dimensions]);

  // default boundaries: ±5% = neutral, ±25% = slightly, ±50% = moderate, beyond = very
  useEffect(() => {
    if (!dimensions.length || !results.length) return;
    const updated: { [dim: string]: number[] } = {};
    dimensions.forEach((dim) => {
      const levels = selectedLevels[dim] || [];
      if (levels.length < 2) return;
      if (boundaries[dim] && boundaries[dim].length === levels.length - 1) return;
      const values = results
        .filter((r) => r.dimension === dim)
        .map((r) => r.ate)
        .filter((v) => v !== undefined);
      if (!values.length) return;
      const maxAbs = Math.max(...values.map(Math.abs), 1);
      const fractions = [-0.50, -0.25, -0.05, +0.05, +0.25, +0.50];
      updated[dim] = fractions.map(f => f * maxAbs);
    });
    if (Object.keys(updated).length) {
      setBoundaries((prev) => ({ ...prev, ...updated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions, results, selectedLevels]);

  // default criticalityBasis: 'cate' if any CATE value exists for the dim, else 'ate'
  useEffect(() => {
    if (!dimensions.length || !results.length) return;
    setCriticalityBasis((prev) => {
      let changed = false;
      const updated = { ...prev };
      dimensions.forEach((dim) => {
        if (!updated[dim]) {
          const hasCate = results.some((r) => r.dimension === dim && r.cate != null);
          updated[dim] = hasCate ? 'cate' : 'ate';
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [dimensions, results]);

  const buildCriticalityMap = (): CriticalityMap => {
    const map: CriticalityMap = {};
    dimensions.forEach((dim) => {
      const levels = levelsForDim(dim);
      const cuts = sortedCutsForDim(dim);
      if (levels.length < 2) return;
      if (cuts.length !== levels.length - 1) return;
      map[dim] = levels.map((label, i) => {
        if (i === 0) return { min: -Infinity, max: cuts[0], label };
        if (i === levels.length - 1) return { min: cuts[i - 1], max: Infinity, label };
        return { min: cuts[i - 1], max: cuts[i], label };
      });
    });
    return map;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setContinue({
      label: "Next",
      onClick: () =>
        navigate("/criticality-results", {
          state: { results, criticalityMap: buildCriticalityMap(), criticalityBasis },
        }),
    });
    return () => setContinue(null);
  }, [results, boundaries, selectedLevels, criticalityBasis, navigate, setContinue]);

  return (
    <Box sx={{ width: "90vw", maxWidth: 1100, margin: "0 auto", mt: 4 }}>
      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Causal Effects &amp; Direct Cost Attribution</Typography>
        <Button variant="outlined" color="secondary" onClick={handleReset}>
          Reset & Start Over
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Each dimension is shown in two rows: <strong>ATE</strong> (all traces, global estimate) and <strong>CATE</strong> (length-matched subset, removes trace-length confounding). P-values in parentheses — p&nbsp;&lt;&nbsp;0.05 is significant.
      </Typography>

      {/* What you see / What to do accordions */}
      <Box sx={{ mb: 2, mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Accordion defaultExpanded={false} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Review the effects and set criticality thresholds using the panel below — these thresholds determine how effect values are classified (e.g., "very negative", "neutral") on the next page. You can choose whether thresholds are based on ATE or CATE per dimension. Then click <em>Next</em> to proceed.
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* ATE vs CATE explanation accordion */}
      <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', mb: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2" fontWeight={500}>What is the difference between ATE and CATE — and what do differences between them mean?</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="body2" gutterBottom>
            <strong>ATE (Average Treatment Effect)</strong> compares <em>all</em> deviating traces against <em>all</em> non-deviating traces. It gives the global estimate of the deviation's impact, but may be confounded if deviating traces are systematically shorter or longer (different trace lengths carry different inherent outcomes).
          </Typography>
          <Typography variant="body2" gutterBottom>
            <strong>CATE (Conditional ATE, length-matched)</strong> restricts the comparison to traces whose total length (number of activities) falls within ±2 of the range observed in deviating traces. This makes the control group (non-deviating traces) more similar in scope, reducing the confound from trace length.
          </Typography>
          <Typography variant="body2" gutterBottom>
            <strong>What do differences between ATE and CATE mean?</strong> If they are similar, trace length is likely not a major confounder. If they differ substantially:
          </Typography>
          <Box component="ul" sx={{ pl: 2, mt: 0, mb: 1 }}>
            <Box component="li"><Typography variant="body2">ATE is larger in magnitude → part of the global effect may be driven by trace-length differences rather than the deviation itself.</Typography></Box>
            <Box component="li"><Typography variant="body2">CATE is larger in magnitude → within comparable traces, the deviation has a stronger local effect; the global average dilutes it with dissimilar traces.</Typography></Box>
            <Box component="li"><Typography variant="body2">Signs differ → the deviation may benefit shorter traces but harm longer ones (or vice versa). Investigate further before drawing conclusions.</Typography></Box>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
            For binary dimensions (outcome, compliance, quality), effects are probability changes (e.g. −0.30 = 30% lower probability). For continuous dimensions (time, costs), effects are unit changes (e.g. +120 = 120 seconds longer on average).
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Annotated example cell */}
      <Box sx={{ mt: 2, mb: 3, display: "flex", alignItems: "flex-start", gap: 2.5, flexWrap: "wrap" }}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', minWidth: 150 }}>
          {/* ATE sub-row */}
          <Box sx={{ backgroundColor: "rgba(211,47,47,0.35)", px: 2, py: 0.75, textAlign: "center", borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <Typography variant="body2" sx={{ fontWeight: "bold", lineHeight: 1.3 }}>
              −0.30{" "}<Typography component="span" variant="caption">(0.021)</Typography>
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: '0.6rem', fontStyle: 'italic' }}>
              ATE (global) · n=500
            </Typography>
          </Box>
          {/* CATE sub-row */}
          <Box sx={{ backgroundColor: "rgba(211,47,47,0.25)", px: 2, py: 0.75, textAlign: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: "bold", lineHeight: 1.3 }}>
              −0.28{" "}<Typography component="span" variant="caption" sx={{ fontWeight: 400 }}>(0.034)</Typography>
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontSize: '0.6rem', fontStyle: 'italic' }}>
              CATE · n=210 · 3–9 acts
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            <strong>−0.30 (0.021)</strong> = ATE: the deviation reduces the dimension by 0.30 on average across <em>all</em> traces; p&nbsp;=&nbsp;0.021 is significant.
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            <strong>−0.28 (0.034)</strong> = CATE: same direction, similar magnitude — trace length is not a strong confounder here. n=210 traces with 3–9 activities.
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Cell color: <span style={{ color: "rgba(211,47,47,0.9)" }}>red = negative impact</span>, <span style={{ color: "rgba(76,175,80,0.9)" }}>green = positive impact</span>; intensity reflects effect size.
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Results table */}
      <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: Math.max(400, deviations.length * 140 + 160), tableLayout: 'auto' }}>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  background: '#f5f5f5',
                  fontWeight: 700,
                  minWidth: 160,
                  borderRight: '2px solid',
                  borderColor: 'divider',
                }}
              >
                Dimension
              </TableCell>
              {deviations.map((dev) => (
                <TableCell
                  key={dev}
                  align="center"
                  sx={{ minWidth: 140, maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}
                >
                  {dev}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {dimensions.flatMap((dim, dIdx) => {
              const isLast = dIdx === dimensions.length - 1;
              const groupBorder = isLast ? '1px solid rgba(224,224,224,1)' : '3px solid rgba(0,0,0,0.15)';
              const isTimeCost = results.some(r => r.dimension === dim && r.method === "direct_time_cost");

              // ── ATE row (or time-cost row) ──
              const ateRow = (
                <TableRow key={`${dim}-ate`}>
                  <TableCell sx={{
                    position: 'sticky', left: 0, zIndex: 2, background: '#fafafa',
                    borderRight: '2px solid', borderColor: 'divider',
                    borderBottom: 'none', pt: 1.5, pb: 0.5,
                  }}>
                    <Typography variant="body2" fontWeight="bold" lineHeight={1.2}>{capDim(dim)}</Typography>
                    {isTimeCost ? (
                      <Typography variant="caption" sx={{ color: '#b71c1c', fontSize: '0.63rem', fontStyle: 'italic', fontWeight: 600 }}>Time Constraint Violation</Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.63rem', fontStyle: 'italic' }}>ATE (global)</Typography>
                    )}
                  </TableCell>

                  {deviations.map((dev) => {
                    const result = results.find((r) => r.dimension === dim && r.deviation === dev);
                    if (!result) return <TableCell key={dev} sx={{ borderBottom: 'none' }} />;

                    if (result.error) {
                      return (
                        <Tooltip key={dev} title={`Computation failed: ${result.error}`} arrow placement="top">
                          <TableCell align="center" sx={{ backgroundColor: "#fff3e0", minWidth: 140, cursor: "help", borderBottom: 'none' }}>
                            <Typography variant="caption" color="warning.dark">⚠ error</Typography>
                          </TableCell>
                        </Tooltip>
                      );
                    }

                    // Direct time-cost attribution
                    if (result.method === "direct_time_cost") {
                      const tooltipText = result.total_cost !== undefined
                        ? `Total cost attributed to "${dev}": ${result.total_cost!.toLocaleString('en-US', { maximumFractionDigits: 2 })} ` +
                          `(avg per violation: ${result.mean_cost_violated!.toLocaleString('en-US', { maximumFractionDigits: 2 })}; ` +
                          `${result.n_traces_with_cost} of ${result.n_violations} violated traces exceeded the time window)`
                        : "";
                      const hasCost = (result.total_cost ?? 0) > 0;
                      return (
                        <Tooltip key={dev} title={tooltipText} arrow placement="top">
                          <TableCell align="center" sx={{ backgroundColor: hasCost ? "rgba(211,47,47,0.15)" : "rgba(200,200,200,0.1)", minWidth: 140, cursor: "help", borderLeft: "2px solid #e57373", borderBottom: 'none' }}>
                            <Typography variant="body2" sx={{ fontWeight: "bold", color: hasCost ? "#c62828" : "text.secondary" }}>
                              {result.total_cost !== undefined ? result.total_cost.toLocaleString('en-US', { maximumFractionDigits: 2 }) : "—"}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>total cost</Typography>
                            {result.mean_cost_violated !== undefined && result.mean_cost_violated > 0 && (
                              <Typography variant="caption" sx={{ color: "#b71c1c", display: "block" }}>
                                ø {result.mean_cost_violated.toLocaleString('en-US', { maximumFractionDigits: 2 })} / violation
                              </Typography>
                            )}
                          </TableCell>
                        </Tooltip>
                      );
                    }

                    // ATE cell
                    const bgColor = getCellColor(dim, result.ate, maxAbsEffect);
                    return (
                      <Tooltip key={dev} title={result.ate !== undefined ? getAteTooltip(dim, dev, result.ate) : ""} arrow placement="top">
                        <TableCell align="center" sx={{ backgroundColor: bgColor, minWidth: 140, cursor: "help", borderBottom: 'none', verticalAlign: 'middle' }}>
                          <Typography variant="body2" fontWeight="bold">
                            {result.ate !== undefined
                              ? result.ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "—"}{" "}
                            <Typography component="span" variant="caption">
                              ({result.p_value != null ? result.p_value.toFixed(3) : "—"})
                            </Typography>
                          </Typography>
                          {result.n_traces !== undefined && (
                            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: 'text.secondary' }}>
                              n={result.n_traces.toLocaleString('en-US')}
                            </Typography>
                          )}
                        </TableCell>
                      </Tooltip>
                    );
                  })}
                </TableRow>
              );

              // ── CATE row (skipped for time-cost dimensions) ──
              const cateRow = (
                <TableRow key={`${dim}-cate`}>
                  <TableCell sx={{
                    position: 'sticky', left: 0, zIndex: 2, background: '#f5f8ff',
                    borderRight: '2px solid', borderColor: 'divider',
                    borderTop: 'none', pt: 0.5, pb: 1.5, borderBottom: groupBorder,
                  }}>
                    {!isTimeCost && (
                      <Typography variant="caption" sx={{ color: '#1565c0', fontSize: '0.63rem', fontStyle: 'italic', pl: 0.5 }}>CATE (length-matched)</Typography>
                    )}
                  </TableCell>

                  {deviations.map((dev) => {
                    const result = results.find((r) => r.dimension === dim && r.deviation === dev);
                    if (!result || isTimeCost) {
                      return <TableCell key={dev} sx={{ borderTop: 'none', borderBottom: groupBorder, background: isTimeCost ? undefined : '#f5f8ff' }} />;
                    }
                    if (result.error) {
                      return <TableCell key={dev} sx={{ borderTop: 'none', borderBottom: groupBorder, background: '#f5f8ff' }} />;
                    }

                    const hasCateError = !!result.cate_error;
                    const cateVal = result.cate;
                    const bgColor = (cateVal != null) ? getCellColor(dim, cateVal, maxAbsCateEffect) : '#f5f8ff';
                    const rangeStr = result.cate_length_range
                      ? `${result.cate_length_range[0]}–${result.cate_length_range[1]} acts`
                      : '';

                    return (
                      <TableCell key={dev} align="center" sx={{ backgroundColor: bgColor, minWidth: 140, borderTop: 'none', borderBottom: groupBorder, verticalAlign: 'middle' }}>
                        {hasCateError ? (
                          <Tooltip title={result.cate_error!} arrow placement="bottom">
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', cursor: 'help' }}>n/a</Typography>
                          </Tooltip>
                        ) : cateVal == null ? (
                          <Typography variant="caption" sx={{ color: 'text.disabled' }}>—</Typography>
                        ) : (
                          <Tooltip
                            title={`Length-conditioned CATE${rangeStr ? `: traces with ${rangeStr}` : ''}`}
                            arrow placement="bottom"
                          >
                            <Box sx={{ cursor: 'help' }}>
                              <Typography variant="body2" fontWeight="bold" sx={{ color: '#1565c0' }}>
                                {cateVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                <Typography component="span" variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                                  ({result.cate_p_value != null ? result.cate_p_value.toFixed(3) : '—'})
                                </Typography>
                              </Typography>
                              {result.cate_n_traces != null && (
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: 'text.secondary' }}>
                                  n={result.cate_n_traces.toLocaleString('en-US')}
                                  {rangeStr ? ` · ${rangeStr}` : ''}
                                </Typography>
                              )}
                            </Box>
                          </Tooltip>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );

              return [ateRow, cateRow];
            })}
          </TableBody>
        </Table>
      </Box>

      {/* Per-combination errors */}
      {results.filter((r) => r.error).length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <strong>Some combinations could not be computed:</strong>
          <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
            {results.filter((r) => r.error).map((r, i) => (
              <li key={i} style={{ fontSize: 12 }}>
                <strong>{capDim(r.dimension)}</strong> × <em>{r.deviation}</em>: {r.error}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Criticality configurator */}
      <Box mt={6}>
        <Typography variant="h6" gutterBottom>
          Define Criticality per Dimension
        </Typography>

        {dimensions.map((dim) => {
          const isTimeCostDim = results.some(r => r.dimension === dim && r.method === "direct_time_cost");
          const basis = criticalityBasis[dim] || 'ate';
          const hasCateForDim = results.some((r) => r.dimension === dim && r.cate != null);

          const values = results
            .filter((r) => r.dimension === dim)
            .map((r) => (basis === 'cate' && r.cate != null ? r.cate : r.ate))
            .filter((v) => v !== undefined);

          if (!values.length) return null;

          const rawMin = Math.min(...values);
          const rawMax = Math.max(...values);
          const allWithinUnit = rawMin >= -1 && rawMax <= 1;
          const min = Math.min(allWithinUnit ? -1 : -10, rawMin);
          const max = Math.max(allWithinUnit ? 1 : 10, rawMax);
          const padding = (max - min) * 0.05;
          const scaleMin = min - padding;
          const scaleMax = max + padding;

          const levelsRaw = selectedLevels[dim] || [];
          if (levelsRaw.length < 2) return null;

          const cuts = sortedCutsForDim(dim);
          const displayLevels = levelsForDim(dim);
          const boundariesArr = [min, ...cuts, max];
          const toPct = (v: number) => ((v - scaleMin) / (scaleMax - scaleMin)) * 100;

          const computeGradient = () => {
            const bArr = [scaleMin, ...cuts, scaleMax];
            const stops: string[] = [];
            for (let i = 0; i < displayLevels.length; i++) {
              const start = bArr[i];
              const end = bArr[i + 1];
              const sp = ((start - scaleMin) / (scaleMax - scaleMin)) * 100;
              const ep = ((end - scaleMin) / (scaleMax - scaleMin)) * 100;
              stops.push(`${levelColor(displayLevels[i])} ${sp}%`);
              stops.push(`${levelColor(displayLevels[i])} ${ep}%`);
            }
            return `linear-gradient(to right, ${stops.join(", ")})`;
          };

          return (
            <Box key={dim} mb={5}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography variant="subtitle1">{capDim(dim)}</Typography>
                {!isTimeCostDim && (
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="caption" color="text.secondary">Criticality based on:</Typography>
                    <ToggleButtonGroup
                      value={basis}
                      exclusive
                      size="small"
                      onChange={(_, val) => val && setCriticalityBasis((prev) => ({ ...prev, [dim]: val }))}
                    >
                      <ToggleButton value="ate" sx={{ fontSize: '0.7rem', py: 0.3, px: 1.2 }}>ATE</ToggleButton>
                      <ToggleButton value="cate" disabled={!hasCateForDim} sx={{ fontSize: '0.7rem', py: 0.3, px: 1.2 }}>CATE</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                )}
              </Box>

              <Typography variant="body2">Select Categories:</Typography>
              <FormGroup row>
                {ALL_LEVELS.map((level) => (
                  <FormControlLabel
                    key={level}
                    control={
                      <Checkbox
                        checked={selectedLevels[dim]?.includes(level) || false}
                        onChange={(e) => {
                          const current = selectedLevels[dim] || [];
                          const updated = e.target.checked
                            ? [...current, level]
                            : current.filter((l) => l !== level);
                          const sorted = LEVEL_ORDER.filter((l) => updated.includes(l));
                          setSelectedLevels((prev) => ({ ...prev, [dim]: sorted }));
                          setBoundaries((prev) => {
                            const currentCuts = (prev[dim] || []).slice().sort((a, b) => a - b);
                            const needed = Math.max(sorted.length - 1, 0);
                            if (currentCuts.length === needed) return prev;
                            if (currentCuts.length > needed) {
                              return { ...prev, [dim]: currentCuts.slice(0, needed) };
                            }
                            const range = max - min || 1;
                            const extra = needed - currentCuts.length;
                            const step = range / (sorted.length || 1);
                            const startFrom = currentCuts.length
                              ? currentCuts[currentCuts.length - 1]
                              : min + step;
                            const newCuts = [...currentCuts];
                            for (let i = 0; i < extra; i++) {
                              newCuts.push(startFrom + step * (i + 1));
                            }
                            return { ...prev, [dim]: newCuts.sort((a, b) => a - b) };
                          });
                        }}
                      />
                    }
                    label={level}
                  />
                ))}
              </FormGroup>

              <Typography variant="body2" sx={{ mt: 2 }}>
                {isTimeCostDim ? "Cost Range" : `Effect Range (${basis.toUpperCase()})`}
              </Typography>

              <Slider
                value={cuts}
                min={scaleMin}
                max={scaleMax}
                step={(scaleMax - scaleMin) / 500}
                onChange={(e, newValue) =>
                  setBoundaries((prev) => ({
                    ...prev,
                    [dim]: (newValue as number[]).slice().sort((a, b) => a - b),
                  }))
                }
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                track={false}
                sx={{
                  height: 8,
                  "& .MuiSlider-rail": { opacity: 1, backgroundImage: computeGradient(), border: "none" },
                  "& .MuiSlider-track": { background: "transparent", border: "none" },
                  "& .MuiSlider-thumb": { zIndex: 2 },
                }}
              />

              {/* Cut labels at thumb positions */}
              <Box sx={{ position: "relative", height: 18, mt: 0.5 }}>
                <Typography variant="caption" sx={{ position: "absolute", left: 0 }}>
                  {min.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
                {cuts.map((cut, i) => (
                  <Typography key={i} variant="caption" sx={{ position: "absolute", left: `${toPct(cut)}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                    {cut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                ))}
                <Typography variant="caption" sx={{ position: "absolute", left: "100%", transform: "translateX(-100%)" }}>
                  {max.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              </Box>

              {/* Level labels centered in each segment */}
              <Box sx={{ position: "relative", height: 18, mt: 0.5 }}>
                {displayLevels.map((lvl, i) => {
                  const start = boundariesArr[i];
                  const end = boundariesArr[i + 1];
                  const mid = (start + end) / 2;
                  return (
                    <Typography key={`${lvl}-${i}`} variant="caption" sx={{ position: "absolute", left: `${toPct(mid)}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center" }}>
                      {lvl}
                    </Typography>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>

    </Box>
  );
};

export default CausalResults;
