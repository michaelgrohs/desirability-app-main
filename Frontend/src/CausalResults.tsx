import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
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
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";

import { useLocation, useNavigate } from "react-router-dom";
import { useFileContext } from "./FileContext";
import { useBottomNav } from "./BottomNavContext";

const API_URL = process.env.REACT_APP_API_URL;

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
    return `The ${dimension} CATE is ${fmtAte}. This means that ${dimension} is ${direction} by ${fmtAbs} on average whenever "${deviation}" occurs.`;
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

  const [results, setResults] = useState<CausalResult[]>([]);
  const [loading, setLoading] = useState(true);

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



  // fetch causal effects
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/compute-causal-effects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviations: selectedDeviations.map((d: any) => d.column),
            dimensions: selectedDimensions,
          }),
        });

        const text = await res.text();
        const data = JSON.parse(text);

        setResults(data.results || []);
      } catch (err) {
        console.error("Fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxAbsEffect = getMaxAbsEffect(results);

  const dimensions = Array.from(new Set(results.map((r) => r.dimension)));
  const deviations = Array.from(new Set(results.map((r) => r.deviation)));

  // default selected levels = all, ordered
  useEffect(() => {
    if (!dimensions.length) return;

    setSelectedLevels((prev) => {
      const updated = { ...prev };
      dimensions.forEach((dim) => {
        if (!updated[dim]) updated[dim] = [...LEVEL_ORDER];
      });
      return updated;
    });
  }, [dimensions]);

  // default boundaries based on data distribution (keeps user edits)
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

      const realMin = Math.min(...values);
      const realMax = Math.max(...values);
      const padding = (realMax - realMin) * 0.2 || 1;
      const lower = realMin - padding;
      const upper = realMax + padding;

      const stepSize = (upper - lower) / levels.length;

      updated[dim] = Array.from({ length: levels.length - 1 }, (_, i) => {
        return lower + stepSize * (i + 1);
      });
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
      label: "Criticality Overview",
      onClick: () =>
        navigate("/criticality-results", {
          state: { results, criticalityMap: buildCriticalityMap() },
        }),
    });
    return () => setContinue(null);
  }, [results, boundaries, selectedLevels, navigate, setContinue]);

  if (loading) {
    return (
      <Box mt={6} textAlign="center">
        <CircularProgress />
        <Typography mt={2}>Computing causal effects...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "90vw", maxWidth: 1000, margin: "0 auto", mt: 4 }}>
      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h5">Causal Effects</Typography>

        <Button variant="outlined" color="secondary" onClick={handleReset}>
          Reset & Start Over
        </Button>
      </Box>

      <Box display="flex" alignItems="center" mb={1}>
        <Typography variant="h5">Average Treatment Effects (ATE)</Typography>
        <Tooltip
          title="Each cell shows the Average Treatment Effect (ATE) of a deviation on a process dimension, with the p-value in parentheses. For binary dimensions (outcome, compliance, quality), the ATE represents the change in probability of a positive outcome. For continuous dimensions (time, costs), the ATE is the average unit change. Hover over any cell for a plain-language interpretation. Use the criticality configurator below to assign qualitative labels to ATE ranges."
          arrow
          placement="right"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <InfoIcon fontSize="small" color="action" />
          </IconButton>
        </Tooltip>
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
          {dimensions.map((dim) => (
            <TableRow key={dim}>
              <TableCell>
                <strong>{dim}</strong>
              </TableCell>

              {deviations.map((dev) => {
                const result = results.find(
                  (r) => r.dimension === dim && r.deviation === dev
                );

                if (!result) return <TableCell key={dev} />;

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
                          ({result.p_value !== undefined ? result.p_value.toFixed(3) : "-"})
                        </Typography>
                      </Typography>
                    </TableCell>
                  </Tooltip>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Criticality configurator */}
      <Box mt={6}>
        <Typography variant="h6" gutterBottom>
          Define Criticality per Dimension
        </Typography>

        {dimensions.map((dim) => {
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
                ATE Range
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