import React, { useState } from "react";
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Divider,
  Slider,
  Tooltip,
  IconButton,
  Alert,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useNavigate } from "react-router-dom";
import { useEffect } from 'react';
import { useBottomNav } from './BottomNavContext';
import { useFileContext } from './FileContext';
const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:1904";

type Dimension = "time" | "costs" | "quality" | "outcome" | "compliance";

type ComputationType = "existing" | "formula" | "rule";

interface DimensionConfig {
  dimension: Dimension;
  computationType: ComputationType;
  config: any;
}

const availableDimensions: Dimension[] = [
  "time",
  "costs",
  "quality",
  "outcome",
  "compliance"
];

const dimensionTooltips: Record<Dimension, string> = {
  time: "Time: measures how long a case takes (e.g., total duration in seconds). A lower value is generally better.",
  costs: "Costs: measures monetary expenditure associated with a case. A lower value is generally better.",
  quality: "Quality: a binary indicator of whether a case meets quality standards (1 = meets standards, 0 = does not). A higher value is better.",
  outcome: "Outcome: a binary indicator of a desired case outcome (1 = successful, 0 = unsuccessful). A higher value is better.",
  compliance: "Compliance: a binary indicator of whether a case adheres to regulatory or policy rules (1 = compliant, 0 = non-compliant). A higher value is better.",
};

const computationTypeTooltips: Record<ComputationType, string> = {
  existing: "Use Existing Column: directly maps this dimension to a numeric column already present in the impact matrix. Select the column from the dropdown.",
  formula: "Formula from Column: compute a new value using a pandas-style expression over existing columns (e.g., 'duration / 3600' to convert seconds to hours). Click column name chips to insert them into the expression.",
  rule: "Binary Rule: defines the dimension as 1 (desired) or 0 (undesired) based on a condition on a column. Choose the column, an operator (e.g., 'less than'), and a threshold value. Useful for encoding binary outcomes from raw attributes.",
};

const SelectDimensions: React.FC = () => {
  const navigate = useNavigate();
  const { setContinue } = useBottomNav();
  const {
    selectedDeviations,
    selectedDimensions,
    setSelectedDimensions,
    dimensionConfigs: configs,
    setDimensionConfigs: setConfigs,
  } = useFileContext();

  const [isComputing, setIsComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [computeSuccess, setComputeSuccess] = useState(false);
  const [causalErrors, setCausalErrors] = useState<{ deviation: string; dimension: string; error: string }[]>([]);
  const [showNonSelected, setShowNonSelected] = useState(false);
    const [matrixColumns, setMatrixColumns] = useState<string[]>([]);
    const [matrixRows, setMatrixRows] = useState<any[]>([]);

    useEffect(() => {
      fetch(`${API_URL}/api/current-impact-matrix`)
        .then(res => res.json())
        .then(data => {
          setMatrixColumns(data.columns ?? []);
          setMatrixRows(data.rows ?? []);
        })
        .catch(() => {});
    }, []);

  // ---------------------------
  // Toggle dimension selection
  // ---------------------------
  const toggleDimension = (dimension: Dimension) => {
    setSelectedDimensions((prev: string[]) =>
      prev.includes(dimension)
        ? prev.filter(d => d !== dimension)
        : [...prev, dimension]
    );

    // initialize config if not existing
    setConfigs((prev: Record<string, any>) => ({
      ...prev,
      [dimension]: prev[dimension] || {
        dimension,
        computationType: "existing",
        config: {}
      }
    }));
  };

  // ---------------------------
  // Update config
  // ---------------------------
  const updateConfig = (
    dim: string,
    update: Partial<DimensionConfig>
  ) => {
    setConfigs((prev: Record<string, any>) => ({
      ...prev,
      [dim]: {
        ...prev[dim],
        dimension: dim,
        ...update
      }
    }));
  };

  // ---------------------------
  // Compute dimensions (returns true on success)
  // ---------------------------
  const handleComputeDimensions = async (): Promise<boolean> => {
    try {
      setIsComputing(true);
      setComputeError(null);
      setComputeSuccess(false);

      const dimensionArray = selectedDimensions.map(dim => configs[dim]);

      const response = await fetch(`${API_URL}/api/configure-dimensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensions: dimensionArray
        })
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to compute dimensions. Please check your configuration and try again.");
      }

      // reload matrix after computing
      const updated = await fetch(`${API_URL}/api/current-impact-matrix`);
      const updatedJson = await updated.json();
      setMatrixColumns(updatedJson.columns ?? []);
      setMatrixRows(updatedJson.rows ?? []);

      setComputeSuccess(true);
      return true;
    } catch (error) {
      console.error(error);
      setComputeError(String(error).replace(/^Error:\s*/, ""));
      return false;
    } finally {
      setIsComputing(false);
    }
  };

  // ---------------------------
  // Continue (configure → causal effects → navigate)
  // ---------------------------
  const handleSubmit = async () => {
    if (selectedDimensions.length === 0) return;
    setCausalErrors([]);

    const configOk = await handleComputeDimensions();
    if (!configOk) return;

    // Now run causal computation and stay on this page until done
    try {
      setIsComputing(true);
      const res = await fetch(`${API_URL}/api/compute-causal-effects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviations: (selectedDeviations as any[]).map((d: any) => d.column),
          dimensions: selectedDimensions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setComputeError(data?.error || "Causal effect computation failed.");
        return;
      }

      const results: any[] = data.results || [];
      const errors = results.filter((r: any) => r.error);
      const successes = results.filter((r: any) => r.ate !== undefined);

      setCausalErrors(errors);

      if (successes.length === 0) {
        setComputeError("No causal effects could be computed. See details below.");
        return;
      }

      navigate("/causal-results", {
        state: { selectedDimensions, selectedDeviations, results },
      });
    } catch (err) {
      setComputeError("Causal effect computation failed — could not reach the backend.");
    } finally {
      setIsComputing(false);
    }
  };

  useEffect(() => {
    setContinue({
      label: "Continue",
      onClick: handleSubmit,
      disabled: selectedDimensions.length === 0 || isComputing,
    });
    return () => setContinue(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimensions, selectedDeviations, isComputing, configs, setContinue]);

  // ---------------------------
  // Column type helpers (for rule mode)
  // ---------------------------
  const isColumnNumerical = (col: string): boolean => {
    const sample = matrixRows.find(
      (row) => row[col] !== null && row[col] !== undefined && !Array.isArray(row[col])
    );
    return sample !== undefined && typeof sample[col] === "number";
  };

  // Binary columns (only 0/1 values) should use a dropdown, not a slider
  const isColumnBinary = (col: string): boolean => {
    const vals = matrixRows
      .map((row) => row[col])
      .filter((v) => v !== null && v !== undefined && !Array.isArray(v));
    if (vals.length === 0) return false;
    const unique = new Set(vals.map(String));
    return unique.size <= 2 && Array.from(unique).every((v) => v === "0" || v === "1");
  };

  const getColumnUniqueValues = (col: string): string[] => {
    const values = new Set<string>();
    matrixRows.forEach((row) => {
      const val = row[col];
      if (val === null || val === undefined) return;
      if (Array.isArray(val)) {
        val.forEach((v: string) => values.add(String(v)));
      } else {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  };

  const getColumnRange = (col: string): [number, number] => {
    const nums = matrixRows
      .map((row) => row[col])
      .filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return [0, 100];
    return [Math.min(...nums), Math.max(...nums)];
  };

  // Columns usable in rule conditions: exclude only trace_id
  const ruleColumns = matrixColumns.filter((col) => col !== "trace_id");

  // Activity-sequence column (array): usable only with contains/starts_with/ends_with
  const isActivityColumn = (col: string) =>
    matrixRows.some((r) => Array.isArray(r[col]));

  // ---------------------------
  // Matrix display helpers
  // ---------------------------
  const DIMENSION_NAMES = new Set(["time", "costs", "quality", "outcome", "compliance"]);
  const selectedDevNames = new Set((selectedDeviations as any[]).map((d: any) => d.column));

  // Detect ALL deviation indicator columns: binary (0/1) values, not a dimension or known base col
  const ALWAYS_BASE = new Set(["trace_id", "activities", "trace_duration_seconds"]);
  const isDeviationCol = (col: string): boolean => {
    if (DIMENSION_NAMES.has(col) || ALWAYS_BASE.has(col)) return false;
    if (!matrixRows.length) return false;
    const vals = matrixRows.map(row => row[col]).filter(v => v !== null && v !== undefined);
    return vals.length > 0 && vals.every(v => v === 0 || v === 1);
  };

  const allDetectedDevCols = matrixColumns.filter(isDeviationCol);
  const selectedDevCols = allDetectedDevCols.filter(col => selectedDevNames.has(col));
  const nonSelectedDevCols = allDetectedDevCols.filter(col => !selectedDevNames.has(col));

  const dimCols = matrixColumns.filter(col => DIMENSION_NAMES.has(col));
  const baseCols = matrixColumns.filter(
    col => !DIMENSION_NAMES.has(col) && !allDetectedDevCols.includes(col)
  );

  const orderedCols = [
    ...baseCols,
    ...dimCols,
    ...selectedDevCols,
    ...(showNonSelected ? nonSelectedDevCols : []),
  ];

  const displayColName = (col: string): string => {
    if (col === "trace_duration_seconds") return "Duration (s)";
    return col;
  };

  const renderCell = (row: any, col: string): React.ReactNode => {
    const val = row[col];
    if (Array.isArray(val)) {
      return (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 0", textAlign: "left", minWidth: 220 }}>
          {(val as string[]).map((act, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <Box component="span" sx={{ mx: 0.5, color: "#bbb", fontSize: "11px", lineHeight: 1 }}>›</Box>
              )}
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  background: "#e3f2fd",
                  color: "#1565c0",
                  borderRadius: "3px",
                  px: "5px",
                  py: "1px",
                  fontSize: "10px",
                  whiteSpace: "nowrap",
                  lineHeight: 1.6,
                }}
              >
                {act}
              </Box>
            </React.Fragment>
          ))}
        </Box>
      );
    }
    if (typeof val === "number") return val.toLocaleString("en-US");
    return val ?? "";
  };

  return (
    <Box sx={{ width: "100%", margin: "0 auto", mt: 5 }}>

      <Box display="flex" alignItems="center" mb={2}>
        <Typography variant="h5">Select Impact Dimensions</Typography>
        <Tooltip
          title="Define how each quality dimension should be measured using your trace data. 'Use Existing Column' maps a dimension directly to a numeric column. 'Formula' lets you compute a value via a pandas expression (e.g., col_a / col_b). 'Binary Rule' defines a dimension as 1 (desired) or 0 (undesired) based on a condition — for categorical columns you select the target value from a dropdown; for numeric columns a slider and text field let you set the threshold. Click 'Compute Dimensions' to apply your configuration before proceeding to causal analysis."
          arrow
          placement="right"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <InfoIcon fontSize="small" color="action" />
          </IconButton>
        </Tooltip>
      </Box>

      {availableDimensions.map(dim => (
        <Tooltip key={dim} title={dimensionTooltips[dim]} arrow placement="right">
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedDimensions.includes(dim)}
                onChange={() => toggleDimension(dim)}
              />
            }
            label={dim}
          />
        </Tooltip>
      ))}

      <Divider sx={{ my: 4 }} />

      {selectedDimensions.map(dim => (
        <Card key={dim} sx={{ mb: 3 }}>
          <CardContent>

            <Typography variant="h6">
              Configure: {dim}
            </Typography>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Computation Type</FormLabel>
              <RadioGroup
                value={configs[dim]?.computationType || "existing"}
                onChange={(e) =>
                  updateConfig(dim, {
                    computationType: e.target.value as ComputationType,
                    config: {}
                  })
                }
              >
                {(["existing", "formula", "rule"] as ComputationType[]).map((ct) => (
                  <FormControlLabel
                    key={ct}
                    value={ct}
                    control={<Radio />}
                    label={
                      <Box display="flex" alignItems="center">
                        <span>
                          {ct === "existing" ? "Use Existing Column" : ct === "formula" ? "Formula from Column" : "Binary Rule"}
                        </span>
                        <Tooltip title={computationTypeTooltips[ct]} arrow placement="right">
                          <IconButton
                            size="small"
                            sx={{ ml: 0.5, p: 0.25 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <HelpOutlineIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {/* EXISTING */}
            {configs[dim]?.computationType === "existing" && (
                <Select
                  fullWidth
                  sx={{ mt: 2 }}
                  value={configs[dim]?.config?.column || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: { column: e.target.value }
                    })
                  }
                >

                  {matrixColumns.map(col => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>
            )}

            {/* FORMULA */}
            {configs[dim]?.computationType === "formula" && (
              <>
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Formula Expression"
                  placeholder='Example: (duration - planned_duration) / 60'
                  value={configs[dim]?.config?.expression || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        expression: e.target.value
                      }
                    })
                  }
                  multiline
                  minRows={2}
                />

                <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                  Available columns:
                </Typography>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {matrixColumns.map((col) => (
                    <Button
                      key={col}
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        const current = configs[dim]?.config?.expression || "";
                        updateConfig(dim, {
                          config: {
                            expression: current + col
                          }
                        });
                      }}
                    >
                      {col}
                    </Button>
                  ))}
                </Box>
              </>
            )}


            {/* RULE — compound conditions */}
            {configs[dim]?.computationType === "rule" && (() => {
              // Normalise: always work with the conditions array format
              const rawConfig = configs[dim]?.config || {};
              const conditions: any[] = rawConfig.conditions && rawConfig.conditions.length > 0
                ? rawConfig.conditions
                : rawConfig.column
                  ? [{ column: rawConfig.column, operator: rawConfig.operator || "", value: rawConfig.value || "" }]
                  : [{ column: "", operator: "", value: "" }];

              const setConditions = (newConds: any[]) => {
                updateConfig(dim, { config: { conditions: newConds } });
              };

              const updateCondition = (idx: number, patch: any) => {
                const updated = conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
                setConditions(updated);
              };

              const addCondition = (connector: "AND" | "OR") => {
                setConditions([...conditions, { connector, column: "", operator: "", value: "" }]);
              };

              const removeCondition = (idx: number) => {
                if (conditions.length <= 1) return;
                setConditions(conditions.filter((_, i) => i !== idx));
              };

              const renderValueInput = (cond: any, idx: number) => {
                if (!cond.column) return (
                  <TextField
                    fullWidth
                    sx={{ mt: 1 }}
                    size="small"
                    label="Value"
                    value={cond.value || ""}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  />
                );
                if (isColumnBinary(cond.column)) {
                  return (
                    <Select
                      fullWidth
                      sx={{ mt: 1 }}
                      size="small"
                      displayEmpty
                      value={cond.value || ""}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                    >
                      <MenuItem value=""><em>Select value…</em></MenuItem>
                      <MenuItem value="0">0 — absent / false</MenuItem>
                      <MenuItem value="1">1 — present / true</MenuItem>
                    </Select>
                  );
                }
                if (isColumnNumerical(cond.column)) {
                  const [rMin, rMax] = getColumnRange(cond.column);
                  const step = rMin === rMax ? 1 : (rMax - rMin) / 1000;
                  const rawVal = parseFloat(cond.value);
                  const sliderVal = isNaN(rawVal) ? rMin : rawVal;
                  return (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Value</Typography>
                      <Slider
                        value={sliderVal}
                        min={rMin}
                        max={rMax}
                        step={step}
                        onChange={(_, v) => updateCondition(idx, { value: String(v) })}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Value"
                        value={(() => { const v = cond.value; if (!v || isNaN(Number(v))) return v || ""; return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); })()}
                        onChange={(e) => updateCondition(idx, { value: e.target.value.replace(/,/g, '') })}
                      />
                    </Box>
                  );
                }
                return (
                  <Select
                    fullWidth
                    sx={{ mt: 1 }}
                    size="small"
                    displayEmpty
                    value={cond.value || ""}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  >
                    <MenuItem value=""><em>Select value…</em></MenuItem>
                    {getColumnUniqueValues(cond.column).map((v) => (
                      <MenuItem key={v} value={v}>{v}</MenuItem>
                    ))}
                  </Select>
                );
              };

              return (
                <>
                  {conditions.map((cond, idx) => (
                    <Box key={idx} sx={{ mt: 2, p: 1.5, border: "1px solid #e0e0e0", borderRadius: 1, backgroundColor: idx === 0 ? undefined : "#fafafa" }}>
                      {/* Connector badge for conditions after the first */}
                      {idx > 0 && (
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Select
                            size="small"
                            value={cond.connector || "AND"}
                            onChange={(e) => updateCondition(idx, { connector: e.target.value })}
                            sx={{ minWidth: 90, fontWeight: 700 }}
                          >
                            <MenuItem value="AND">AND</MenuItem>
                            <MenuItem value="OR">OR</MenuItem>
                          </Select>
                          <Typography variant="caption" color="text.secondary">condition {idx + 1}</Typography>
                          <Button size="small" color="error" onClick={() => removeCondition(idx)} sx={{ ml: "auto", minWidth: 0, px: 1 }}>
                            ✕
                          </Button>
                        </Box>
                      )}

                      {/* NOT toggle + Column */}
                      <Box display="flex" alignItems="center" gap={1}>
                        <Button
                          size="small"
                          variant={cond.negate ? "contained" : "outlined"}
                          color={cond.negate ? "error" : "inherit"}
                          sx={{ minWidth: 44, fontWeight: 700, flexShrink: 0 }}
                          onClick={() => updateCondition(idx, { negate: !cond.negate })}
                        >
                          NOT
                        </Button>
                        <Select
                          fullWidth
                          size="small"
                          displayEmpty
                          value={cond.column || ""}
                          onChange={(e) => updateCondition(idx, { column: e.target.value, value: "" })}
                        >
                          <MenuItem value=""><em>Select column…</em></MenuItem>
                          {ruleColumns.map((col) => (
                            <MenuItem key={col} value={col}>{col}</MenuItem>
                          ))}
                        </Select>
                      </Box>

                      {/* Operator */}
                      <Select
                        fullWidth
                        size="small"
                        sx={{ mt: 1 }}
                        displayEmpty
                        value={cond.operator || ""}
                        onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                      >
                        <MenuItem value=""><em>Select operator…</em></MenuItem>
                        {isActivityColumn(cond.column) ? (
                          // Array columns only support sequence operators
                          [
                            <MenuItem key="contains" value="contains">Contains activity</MenuItem>,
                            <MenuItem key="starts_with" value="starts_with">Starts with activity</MenuItem>,
                            <MenuItem key="ends_with" value="ends_with">Ends with activity</MenuItem>,
                          ]
                        ) : isColumnNumerical(cond.column) && !isColumnBinary(cond.column) ? (
                          [
                            <MenuItem key="greater" value="greater">Greater Than</MenuItem>,
                            <MenuItem key="less" value="less">Less Than</MenuItem>,
                            <MenuItem key="greater_equal" value="greater_equal">Greater or Equal</MenuItem>,
                            <MenuItem key="less_equal" value="less_equal">Less or Equal</MenuItem>,
                            <MenuItem key="equals" value="equals">Equals</MenuItem>,
                            <MenuItem key="not_equals" value="not_equals">Not Equals</MenuItem>,
                          ]
                        ) : (
                          [
                            <MenuItem key="equals" value="equals">Equals</MenuItem>,
                            <MenuItem key="not_equals" value="not_equals">Not Equals</MenuItem>,
                            <MenuItem key="contains" value="contains">Contains</MenuItem>,
                            <MenuItem key="starts_with" value="starts_with">Starts With</MenuItem>,
                            <MenuItem key="ends_with" value="ends_with">Ends With</MenuItem>,
                          ]
                        )}
                      </Select>

                      {/* Value */}
                      {renderValueInput(cond, idx)}
                    </Box>
                  ))}

                  {/* Add AND / OR buttons */}
                  <Box display="flex" gap={1} mt={1.5}>
                    <Button size="small" variant="outlined" onClick={() => addCondition("AND")}>
                      + AND
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => addCondition("OR")}>
                      + OR
                    </Button>
                  </Box>
                </>
              );
            })()}


          </CardContent>
        </Card>
      ))}

      {computeError && (
        <Alert severity="error" sx={{ mt: 3 }} onClose={() => { setComputeError(null); setCausalErrors([]); }}>
          {computeError}
        </Alert>
      )}

      {causalErrors.length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <strong>Some causal effects could not be computed:</strong>
          <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
            {causalErrors.map((e, i) => (
              <li key={i} style={{ fontSize: 12 }}>
                <strong>{e.dimension}</strong> × <em>{e.deviation}</em>: {e.error}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {computeSuccess && !computeError && causalErrors.length === 0 && (
        <Alert severity="success" sx={{ mt: 3 }} onClose={() => setComputeSuccess(false)}>
          Dimensions computed successfully.
        </Alert>
      )}

        <Divider sx={{ my: 5 }} />

        <Box display="flex" alignItems="center" mb={1} gap={2}>
          <Typography variant="h6">Current Impact Matrix</Typography>
          {nonSelectedDevCols.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowNonSelected(prev => !prev)}
            >
              {showNonSelected
                ? "Hide Non-selected Deviations"
                : `Show Non-selected Deviations (${nonSelectedDevCols.length})`}
            </Button>
          )}
        </Box>

        <Box sx={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 1 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              {/* Top row: base cols (rowSpan=2) + group headers */}
              <tr>
                {baseCols.map(col => (
                  <th
                    key={col}
                    rowSpan={dimCols.length > 0 || selectedDevCols.length > 0 || (showNonSelected && nonSelectedDevCols.length > 0) ? 2 : 1}
                    style={{
                      border: "1px solid #ccc",
                      padding: "6px 8px",
                      background: "#f5f5f5",
                      fontSize: "11px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      verticalAlign: "middle",
                    }}
                  >
                    {displayColName(col)}
                  </th>
                ))}
                {dimCols.length > 0 && (
                  <th
                    colSpan={dimCols.length}
                    style={{
                      border: "1px solid #ccc",
                      padding: "5px 8px",
                      background: "#e8f5e9",
                      fontSize: "11px",
                      fontWeight: 700,
                      textAlign: "center",
                      borderBottom: "2px solid #a5d6a7",
                    }}
                  >
                    Impact Dimensions
                  </th>
                )}
                {selectedDevCols.length > 0 && (
                  <th
                    colSpan={selectedDevCols.length}
                    style={{
                      border: "1px solid #ccc",
                      padding: "5px 8px",
                      background: "#fff3e0",
                      fontSize: "11px",
                      fontWeight: 700,
                      textAlign: "center",
                      borderBottom: "2px solid #ffcc80",
                    }}
                  >
                    Deviations
                  </th>
                )}
                {showNonSelected && nonSelectedDevCols.length > 0 && (
                  <th
                    colSpan={nonSelectedDevCols.length}
                    style={{
                      border: "1px solid #ccc",
                      padding: "5px 8px",
                      background: "#f3e5f5",
                      fontSize: "11px",
                      fontWeight: 700,
                      textAlign: "center",
                      borderBottom: "2px solid #ce93d8",
                    }}
                  >
                    Non-selected Deviations
                  </th>
                )}
              </tr>
              {/* Sub-header row (only when groups exist) */}
              {(dimCols.length > 0 || selectedDevCols.length > 0 || (showNonSelected && nonSelectedDevCols.length > 0)) && (
                <tr>
                  {dimCols.map(col => (
                    <th key={col} style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f1f8e9", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", textAlign: "center" }}>
                      {displayColName(col)}
                    </th>
                  ))}
                  {selectedDevCols.map(col => (
                    <th key={col} style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#fff8e1", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", textAlign: "center" }}>
                      {displayColName(col)}
                    </th>
                  ))}
                  {showNonSelected && nonSelectedDevCols.map(col => (
                    <th key={col} style={{ border: "1px solid #ccc", padding: "5px 8px", background: "#f8eafb", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", textAlign: "center" }}>
                      {displayColName(col)}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {matrixRows.slice(0, 200).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {orderedCols.map(col => {
                    const isDimCol = DIMENSION_NAMES.has(col);
                    const isSelectedDev = selectedDevNames.has(col);
                    const isNonSelectedDev = nonSelectedDevCols.includes(col);
                    return (
                      <td
                        key={col}
                        style={{
                          border: "1px solid #e8e8e8",
                          padding: "5px 8px",
                          fontSize: "11px",
                          textAlign: "center",
                          verticalAlign: "middle",
                          background: isDimCol
                            ? "rgba(232,245,233,0.4)"
                            : isSelectedDev
                            ? "rgba(255,243,224,0.4)"
                            : isNonSelectedDev
                            ? "rgba(243,229,245,0.4)"
                            : undefined,
                        }}
                      >
                        {renderCell(row, col)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        {matrixRows.length > 200 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Showing first 200 of {matrixRows.length} rows.
          </Typography>
        )}

    </Box>
  );
};

export default SelectDimensions;
