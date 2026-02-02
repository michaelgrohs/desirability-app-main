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

  const [selectedDimensions, setSelectedDimensions] = useState<Dimension[]>([]);
  const [configs, setConfigs] = useState<Record<string, DimensionConfig>>({});

  const toggleDimension = (dim: Dimension) => {
    if (selectedDimensions.includes(dim)) {
      setSelectedDimensions(selectedDimensions.filter(d => d !== dim));
    } else {
      setSelectedDimensions([...selectedDimensions, dim]);
    }
  };

  const updateConfig = (dim: Dimension, update: Partial<DimensionConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [dim]: {
        ...prev[dim],
        dimension: dim,
        ...update
      }
    }));
  };

  const handleSubmit = async () => {
    const dimensionConfigs = selectedDimensions.map(dim => configs[dim]);

    await fetch(`${API_URL}/api/configure-dimensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dimensions: dimensionConfigs })
    });

    navigate("/analysis"); // next screen
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
                value={configs[dim]?.computationType || ""}
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

            {/* EXISTING COLUMN */}
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
                <MenuItem value="trace_duration_seconds">trace_duration_seconds</MenuItem>
                <MenuItem value="AMOUNT_REQ">AMOUNT_REQ</MenuItem>
              </Select>
            )}

            {/* FORMULA */}
            {configs[dim]?.computationType === "formula" && (
              <>
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Base Column"
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: { ...configs[dim]?.config, baseColumn: e.target.value }
                    })
                  }
                />

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
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Column"
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: { ...configs[dim]?.config, column: e.target.value }
                    })
                  }
                />

                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label="Equals Value"
                  onChange={(e) =>
                    updateConfig(dim, {
                      config: { ...configs[dim]?.config, value: e.target.value }
                    })
                  }
                />
              </>
            )}

          </CardContent>
        </Card>
      ))}

      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained"
          disabled={selectedDimensions.length === 0}
          onClick={handleSubmit}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
};

export default SelectDimensions;
