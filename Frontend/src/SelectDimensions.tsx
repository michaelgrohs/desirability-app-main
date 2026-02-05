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
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from 'react';
const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

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
  const location = useLocation();
    const selectedDeviations = location.state?.selectedDeviations || [];


  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [configs, setConfigs] = useState<Record<Dimension, DimensionConfig>>({} as any);
  const [isComputing, setIsComputing] = useState(false);
    const [matrixColumns, setMatrixColumns] = useState<string[]>([]);
    const [matrixRows, setMatrixRows] = useState<any[]>([]);
    const [matrixLoading, setMatrixLoading] = useState(true);

    useEffect(() => {
      fetch(`${API_URL}/api/current-impact-matrix`)
        .then(res => res.json())
        .then(data => {
          setMatrixColumns(data.columns);
          setMatrixRows(data.rows);
          setMatrixLoading(false);
        });
    }, []);

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
                <Select
                  fullWidth
                  sx={{ mt: 2 }}
                  value={configs[dim]?.config?.baseColumn || ""}
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        baseColumn: e.target.value
                      }
                    })
                  }
                >
                  {matrixColumns.map(col => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>

                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Subtract Constant"
                  type="number"
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        subtractConstant: Number(e.target.value)
                      }
                    })
                  }
                />

                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Multiplier"
                  type="number"
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: {
                        ...configs[dim]?.config,
                        multiplier: Number(e.target.value)
                      }
                    })
                  }
                />
              </>
            )}

            {/* RULE */}
            {configs[dim]?.computationType === "rule" && (
              <>
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
                  {matrixColumns.map(col => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>

                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Equals Value"
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

      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button
          variant="contained"
          color="primary"
          disabled={selectedDimensions.length === 0 || isComputing}
          onClick={handleComputeDimensions}
        >
          {isComputing ? "Computing..." : "Compute Dimensions"}
        </Button>

        <Button
          variant="contained"
          disabled={selectedDimensions.length === 0}
          onClick={handleSubmit}
        >
          Continue
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
                      {row[col]}
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
