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
  IconButton,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
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
  method?: string;           // "cate" | "direct_time_cost"
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

const getAteTooltip = (dimension: string, deviation: string, ate: number): string => {
  if (!isFinite(ate)) return "";
  const dimLower = dimension.toLowerCase();
  const isBinary = BINARY_DIMENSIONS.has(dimLower);
  const direction = ate < 0 ? "decreased" : "increased";
  const absAte = Math.abs(ate);

  if (isBinary) {
    const pct = (absAte * 100).toLocaleString('en-US', { maximumFractionDigits: 1 });
    return `The likelihood of a positive ${dimension} is ${direction} on average by ${pct}% if "${deviation}" happens.`;
  } else {
    const fmtAbs = absAte.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const fmtAte = ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `The ${dimension} ATE is ${fmtAte}. This means that ${dimension} is ${direction} by ${fmtAbs} on average whenever "${deviation}" occurs.`;
  }
};

const levelColor = (level: CriticalityLevel) => {
  switch (level) {
    case "very negative":
      return "rgba(211,47,47,1)";
    case "negative":
      return "rgba(255,152,0,1)";
    case "slightly negative":
      return "rgba(255,183,77,1)";
    case "neutral":
      return "rgba(200,200,200,1)";
    case "slightly positive":
      return "rgba(129,199,132,1)";
    case "positive":
      return "rgba(76,175,80,1)";
    case "very positive":
      return "rgba(0,100,0,1)";
    default:
      return "#ccc";
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

  const getMaxAbsEffect = (rows: any[]) => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => Math.abs(r.ate ?? 0)), 1);
  };

  const getCellColor = (dimension: string, ate: number, maxAbs: number) => {
    if (ate === undefined || maxAbs === 0) return "#fff";

    const intensity = Math.max(Math.min(Math.abs(ate) / maxAbs, 1), 0.15);

    const isNegativeGood = ["time", "costs"].includes(dimension.toLowerCase());
    const isPositiveGood = ["outcome", "quality", "compliance"].includes(
      dimension.toLowerCase()
    );

    let isGood = false;
    if (isNegativeGood) isGood = ate < 0;
    else if (isPositiveGood) isGood = ate > 0;
    else isGood = ate > 0;

    return isGood
      ? `rgba(76,175,80,${intensity})`
      : `rgba(211,47,47,${intensity})`;
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




  const maxAbsEffect = getMaxAbsEffect(results);

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

  // default boundaries: neutral zone ±10% of maxAbs, then ±40% and ±75% cuts
  // for negative-good dims (time, costs) levelsForDim() reverses the labels,
  // so the same cut positions automatically mean "less = better"
  useEffect(() => {
    if (!dimensions.length || !results.length) return;

    const updated: { [dim: string]: number[] } = {};

    dimensions.forEach((dim) => {
      const levels = selectedLevels[dim] || [];
      if (levels.length < 2) return;

      // keep user changes if already correct length
      if (boundaries[dim] && boundaries[dim].length === levels.length - 1) return;

      const values = results
        .filter((r) => r.dimension === dim)
        .map((r) => r.ate)
        .filter((v) => v !== undefined);

      if (!values.length) return;

      const maxAbs = Math.max(...values.map(Math.abs), 1);

      // 6 cuts for 7 levels: [-50%, -25%, -5%, +5%, +25%, +50%] × maxAbs
      // neutral = (±5%), slightly neg/pos = (5–25%), neg/pos = (25–50%), very = (>50%)
      const fractions = [-0.50, -0.25, -0.05, +0.05, +0.25, +0.50];
      updated[dim] = fractions.map(f => f * maxAbs);
    });

    if (Object.keys(updated).length) {
      setBoundaries((prev) => ({ ...prev, ...updated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions, results, selectedLevels]);

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
          state: { results, criticalityMap: buildCriticalityMap() },
        }),
    });
    return () => setContinue(null);
  }, [results, boundaries, selectedLevels, navigate, setContinue]);


  return (
    <Box sx={{ width: "90vw", maxWidth: 1000, margin: "0 auto", mt: 4 }}>
      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Causal Effects &amp; Direct Cost Attribution</Typography>

        <Button variant="outlined" color="secondary" onClick={handleReset}>
          Reset & Start Over
        </Button>
      </Box>

      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Accordion defaultExpanded={false} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What you see</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              A matrix showing the estimated causal effect (ATE) of each selected deviation on each impact dimension. Negative values indicate that the deviation reduces the dimension (e.g., shorter time, lower outcome probability); positive values indicate an increase. Cells in parentheses show the p-value; values below 0.05 are statistically significant.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={false} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Review the effects and set criticality thresholds using the panel on the right — these thresholds determine how ATE values are classified (e.g., "very negative", "neutral") on the next page. Then click <em>Next</em> to proceed to the Criticality Overview.
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* ATE intuition explanation */}
      <Box sx={{ backgroundColor: "grey.50", border: "1px solid", borderColor: "grey.200", borderRadius: 2, p: 2, mb: 3 }}>
        <Typography variant="body2" gutterBottom>
          An <strong>ATE</strong> (Average Treatment Effect) measures the estimated causal impact of a deviation on a process dimension, compared to cases without that deviation. For example, an ATE of <strong>−12.5</strong> for the <em>time</em> dimension means that cases where this deviation occurred were on average <strong>12.5 time units (e.g., seconds) shorter</strong>.
            An ATE of <strong>−0.30</strong> for a binary dimension like <em>outcome</em> means the probability of a positive outcome was on average <strong>30% lower</strong> in affected cases.
        </Typography>
        <Typography variant="body2" gutterBottom sx={{ mt: 1 }}>
          The <strong>p-value</strong> (in parentheses) indicates statistical significance: a smaller p-value means the estimated effect is less likely to be due to chance. A common threshold is p &lt; 0.05.
        </Typography>
        <Typography variant="body2" gutterBottom sx={{ mt: 1 }}>
          For dimensions configured as <strong>Time-window Cost</strong>, no statistical estimation is needed — the cost per trace is computed directly from how much the time window was exceeded. Cells show the <strong>total cost</strong> (sum over all violations) and the average cost per violated trace.
        </Typography>

        {/* Annotated example cell */}
        <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Box
            sx={{
              backgroundColor: "rgba(211,47,47,0.35)",
              border: "2px solid rgba(211,47,47,0.7)",
              borderRadius: 1,
              px: 2,
              py: 1,
              textAlign: "center",
              minWidth: 110,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: "bold" }}>
              −0.30{" "}
              <Typography component="span" variant="caption">
                (0.021)
              </Typography>
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              <strong>−0.30</strong> = ATE: the deviation reduces the dimension by 0.30 units on average
              (or −30%ok, make the toolt for binary dimensions)
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              <strong>(0.021)</strong> = p-value: statistically significant at the 5% level (p &lt; 0.05)
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              Cell color: <span style={{ color: "rgba(211,47,47,0.9)" }}>red = negative impact</span>, <span style={{ color: "rgba(76,175,80,0.9)" }}>green = positive impact</span>; intensity reflects effect size.
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Dimension</TableCell>
            {deviations.map((dev) => (
              <TableCell key={dev} align="center">
                {dev}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {dimensions.map((dim) => {
            const isTimeCost = results.some(r => r.dimension === dim && r.method === "direct_time_cost");
            return (
            <TableRow key={dim}>
              <TableCell>
                <strong>{dim}</strong>
                {isTimeCost && (
                  <Typography variant="caption" sx={{ display: "block", color: "#b71c1c", fontWeight: 600 }}>
                    Time Constraint Violation
                  </Typography>
                )}
              </TableCell>

              {deviations.map((dev) => {
                const result = results.find(
                  (r) => r.dimension === dim && r.deviation === dev
                );

                if (!result) return <TableCell key={dev} />;

                if (result.error) {
                  return (
                    <Tooltip key={dev} title={`Computation failed: ${result.error}`} arrow placement="top">
                      <TableCell align="center" style={{ backgroundColor: "#fff3e0", minWidth: 80, cursor: "help" }}>
                        <Typography variant="caption" color="warning.dark">⚠ error</Typography>
                      </TableCell>
                    </Tooltip>
                  );
                }

                // ── Direct time-cost attribution ─────────────────────────────
                if (result.method === "direct_time_cost") {
                  const tooltipText = result.total_cost !== undefined
                    ? `Total cost attributed to "${dev}": ${result.total_cost!.toLocaleString('en-US', { maximumFractionDigits: 2 })} ` +
                      `(avg per violation: ${result.mean_cost_violated!.toLocaleString('en-US', { maximumFractionDigits: 2 })}; ` +
                      `${result.n_traces_with_cost} of ${result.n_violations} violated traces exceeded the time window)`
                    : "";
                  const hasCost = (result.total_cost ?? 0) > 0;
                  return (
                    <Tooltip key={dev} title={tooltipText} arrow placement="top">
                      <TableCell align="center" style={{ backgroundColor: hasCost ? "rgba(211,47,47,0.15)" : "rgba(200,200,200,0.1)", minWidth: 110, cursor: "help", borderLeft: "2px solid #e57373" }}>
                        <Typography variant="body2" sx={{ fontWeight: "bold", color: hasCost ? "#c62828" : "text.secondary" }}>
                          {result.total_cost !== undefined
                            ? result.total_cost.toLocaleString('en-US', { maximumFractionDigits: 2 })
                            : "—"}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                          total cost
                        </Typography>
                        {result.mean_cost_violated !== undefined && result.mean_cost_violated > 0 && (
                          <Typography variant="caption" sx={{ color: "#b71c1c", display: "block" }}>
                            ø {result.mean_cost_violated.toLocaleString('en-US', { maximumFractionDigits: 2 })} / violation
                          </Typography>
                        )}
                      </TableCell>
                    </Tooltip>
                  );
                }

                // ── ATE ──────────────────────────────────────────────────────
                const bgColor = getCellColor(dim, result.ate, maxAbsEffect);

                return (
                  <Tooltip
                    key={dev}
                    title={result.ate !== undefined ? getAteTooltip(dim, dev, result.ate) : ""}
                    arrow
                    placement="top"
                  >
                    <TableCell
                      align="center"
                      style={{ backgroundColor: bgColor, minWidth: 80, cursor: "help" }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                        {result.ate !== undefined
                          ? result.ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "-"}{" "}
                        <Typography component="span" variant="caption">
                          ({result.p_value != null ? result.p_value.toFixed(3) : "-"})
                        </Typography>
                      </Typography>
                    </TableCell>
                  </Tooltip>
                );
              })}
            </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Per-combination errors */}
      {results.filter((r) => r.error).length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <strong>Some combinations could not be computed:</strong>
          <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
            {results.filter((r) => r.error).map((r, i) => (
              <li key={i} style={{ fontSize: 12 }}>
                <strong>{r.dimension}</strong> × <em>{r.deviation}</em>: {r.error}
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
          const values = results
            .filter((r) => r.dimension === dim)
            .map((r) => r.ate)
            .filter((v) => v !== undefined);

          if (!values.length) return null;

          // compute min/max per dimension
            const rawMin = Math.min(...values);
            const rawMax = Math.max(...values);

            // Use ±1 minimum scale when all ATEs are within [-1, 1], otherwise ±10
            const allWithinUnit = rawMin >= -1 && rawMax <= 1;
            const min = Math.min(allWithinUnit ? -1 : -10, rawMin);
            const max = Math.max(allWithinUnit ? 1 : 10, rawMax);

            // optional padding to avoid 0-length gradient
            const padding = (max - min) * 0.05; // 5%
            const scaleMin = min - padding;
            const scaleMax = max + padding;


          const levelsRaw = selectedLevels[dim] || [];
          if (levelsRaw.length < 2) return null;

          const cuts = sortedCutsForDim(dim);
          const displayLevels = levelsForDim(dim); // already reversed if negative-good
          const boundariesArr = [min, ...cuts, max];
          const toPct = (v: number) => ((v - scaleMin) / (scaleMax - scaleMin)) * 100;

          const computeGradient = () => {
              const boundariesArr = [scaleMin, ...cuts, scaleMax];
              const stops: string[] = [];

              for (let i = 0; i < displayLevels.length; i++) {
                const start = boundariesArr[i];
                const end = boundariesArr[i + 1];

                const startPercent = ((start - scaleMin) / (scaleMax - scaleMin)) * 100;
                const endPercent = ((end - scaleMin) / (scaleMax - scaleMin)) * 100;

                // two stops per block for solid color
                stops.push(`${levelColor(displayLevels[i])} ${startPercent}%`);
                stops.push(`${levelColor(displayLevels[i])} ${endPercent}%`);
              }

              return `linear-gradient(to right, ${stops.join(", ")})`;
            };


          return (
            <Box key={dim} mb={5}>
              <Typography variant="subtitle1" gutterBottom>
                {dim}
              </Typography>

              {/* Multi Select Categories */}
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

                          // adjust boundaries length if needed (keep existing as much as possible)
                          setBoundaries((prev) => {
                            const currentCuts = (prev[dim] || []).slice().sort((a, b) => a - b);
                            const needed = Math.max(sorted.length - 1, 0);
                            if (currentCuts.length === needed) return prev;

                            // if fewer needed, truncate
                            if (currentCuts.length > needed) {
                              return { ...prev, [dim]: currentCuts.slice(0, needed) };
                            }

                            // if more needed, extend using equal spacing across range
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

              {/* Range Slider */}
              <Typography variant="body2" sx={{ mt: 2 }}>
                {isTimeCostDim ? "Cost Range" : "ATE Range"}
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
                  "& .MuiSlider-rail": {
                    opacity: 1,
                    backgroundImage: computeGradient(),
                    border: "none",
                  },
                  "& .MuiSlider-track": {
                    background: "transparent",
                    border: "none",
                  },
                  "& .MuiSlider-thumb": {
                    zIndex: 2,
                  },
                }}
              />




                {/* Cut labels at exact thumb positions */}
                <Box sx={{ position: "relative", height: 18, mt: 0.5 }}>
                  {/* min */}
                  <Typography
                    variant="caption"
                    sx={{ position: "absolute", left: 0, transform: "translateX(0%)" }}
                  >
                    {min.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>

                  {/* cuts */}
                  {cuts.map((cut, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        position: "absolute",
                        left: `${toPct(cut)}%`,
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  ))}

                  {/* max */}
                  <Typography
                    variant="caption"
                    sx={{ position: "absolute", left: "100%", transform: "translateX(-100%)" }}
                  >
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
                      <Typography
                        key={`${lvl}-${i}`}
                        variant="caption"
                        sx={{
                          position: "absolute",
                          left: `${toPct(mid)}%`,
                          transform: "translateX(-50%)",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                        }}
                      >
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