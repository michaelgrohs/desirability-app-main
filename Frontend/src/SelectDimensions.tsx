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
  Divider
} from "@mui/material";
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

const SelectDimensions: React.FC = () => {
  const navigate = useNavigate();
  const { setContinue } = useBottomNav();
  const { selectedDeviations } = useFileContext();


  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [configs, setConfigs] = useState<Record<Dimension, DimensionConfig>>({} as any);
  const [isComputing, setIsComputing] = useState(false);
    const [matrixColumns, setMatrixColumns] = useState<string[]>([]);
    const [matrixRows, setMatrixRows] = useState<any[]>([]);
    const [matrixLoading, setMatrixLoading] = useState(true);

    useEffect(() => {
      setMatrixLoading(true);
      fetch(`${API_URL}/api/current-impact-matrix`)
        .then(res => res.json())
        .then(data => {
          setMatrixColumns(data.columns);
          setMatrixRows(data.rows);
          setMatrixLoading(false);
        });
    }, [selectedDeviations, selectedDimensions]);

  // ---------------------------
  // Toggle dimension selection
  // ---------------------------
  const toggleDimension = (dimension: Dimension) => {
    setSelectedDimensions(prev =>
      prev.includes(dimension)
        ? prev.filter(d => d !== dimension)
        : [...prev, dimension]
    );

    // initialize config if not existing
    setConfigs(prev => ({
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
    dim: Dimension,
    update: Partial<DimensionConfig>
  ) => {
    setConfigs(prev => ({
      ...prev,
      [dim]: {
        ...prev[dim],
        dimension: dim,
        ...update
      }
    }));
  };

  // ---------------------------
  // Compute button
  // ---------------------------
  const handleComputeDimensions = async () => {
    try {
      setIsComputing(true);

      const dimensionArray = selectedDimensions.map(dim => configs[dim]);

      const response = await fetch(`${API_URL}/api/configure-dimensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensions: dimensionArray
        })
      });

      if (!response.ok) {
        throw new Error("Failed to compute dimensions");
      }

      await response.json();

    // reload matrix after computing
    const updated = await fetch(`${API_URL}/api/current-impact-matrix`);
    const updatedJson = await updated.json();
    setMatrixColumns(updatedJson.columns);
    setMatrixRows(updatedJson.rows);

    alert("Dimensions successfully computed!");
    } catch (error) {
      console.error(error);
      alert("Error computing dimensions");
    } finally {
      setIsComputing(false);
    }
  };

  // ---------------------------
  // Continue
  // ---------------------------
  const handleSubmit = () => {
    navigate("/causal-results", {
      state: {
        selectedDimensions,
        selectedDeviations
      }
    });
  };

  useEffect(() => {
    setContinue({
      label: "Continue",
      onClick: handleSubmit,
      disabled: selectedDimensions.length === 0 || isComputing,
    });
    return () => setContinue(null);
  }, [selectedDimensions, selectedDeviations, isComputing, setContinue]);

  return (
    <Box sx={{ width: "90vw", maxWidth: 900, margin: "0 auto", mt: 5 }}>

      <Typography variant="h5" gutterBottom>
        Select Impact Dimensions
      </Typography>

      {availableDimensions.map(dim => (
        <FormControlLabel
          key={dim}
          control={
            <Checkbox
              checked={selectedDimensions.includes(dim)}
              onChange={() => toggleDimension(dim)}
            />
          }
          label={dim}
        />
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
                <FormControlLabel value="existing" control={<Radio />} label="Use Existing Column" />
                <FormControlLabel value="formula" control={<Radio />} label="Formula from Column" />
                <FormControlLabel value="rule" control={<Radio />} label="Binary Rule" />
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


            {/* RULE */}
            {configs[dim]?.computationType === "rule" && (
              <>
                {/* Column Selection */}
                <Select
                  fullWidth
                  sx={{ mt: 2 }}
                  value={configs[dim]?.config?.column || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        column: e.target.value
                      }
                    })
                  }
                >
                  {matrixColumns.map((col) => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>

                {/* Operator Selection */}
                <Select
                  fullWidth
                  sx={{ mt: 2 }}
                  value={configs[dim]?.config?.operator || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        operator: e.target.value
                      }
                    })
                  }
                >
                  <MenuItem value="equals">Equals</MenuItem>
                  <MenuItem value="not_equals">Not Equals</MenuItem>
                  <MenuItem value="contains">Contains</MenuItem>
                  <MenuItem value="starts_with">Starts With</MenuItem>
                  <MenuItem value="ends_with">Ends With</MenuItem>
                  <MenuItem value="greater">Greater Than</MenuItem>
                  <MenuItem value="less">Less Than</MenuItem>
                  <MenuItem value="greater_equal">Greater or Equal</MenuItem>
                  <MenuItem value="less_equal">Less or Equal</MenuItem>
                </Select>

                {/* Value Input */}
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Value"
                  value={configs[dim]?.config?.value || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        value: e.target.value
                      }
                    })
                  }
                />
              </>
            )}


          </CardContent>
        </Card>
      ))}

      <Box display="flex" justifyContent="flex-start" mt={4}>
        <Button
          variant="contained"
          color="primary"
          disabled={selectedDimensions.length === 0 || isComputing}
          onClick={handleComputeDimensions}
        >
          {isComputing ? "Computing..." : "Compute Dimensions"}
        </Button>
      </Box>

        <Divider sx={{ my: 5 }} />

        <Typography variant="h6" gutterBottom>
          Current Impact Matrix
        </Typography>

        <Box sx={{ overflowX: "auto", maxHeight: "10cm", overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {matrixColumns.map(col => (
                  <th
                    key={col}
                    style={{
                      border: "1px solid #ccc",
                      padding: "6px",
                      background: "#f5f5f5",
                      fontSize: "12px"
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row, i) => (
                <tr key={i}>
                  {matrixColumns.map(col => (
                    <td
                      key={col}
                      style={{
                        border: "1px solid #ddd",
                        padding: "6px",
                        fontSize: "12px",
                        textAlign: "center"
                      }}
                    >
                      {Array.isArray(row[col]) ? (
                        <ul style={{ margin: 0, paddingLeft: "1em", textAlign: "left" }}>
                          {row[col].map((act: string, idx: number) => (
                            <li key={idx}>{act}</li>
                          ))}
                        </ul>
                      ) : (
                        row[col]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

    </Box>
  );
};

export default SelectDimensions;
