import React, { useEffect, useState } from "react";
import {
    Box,
    Typography,
    CircularProgress,
    Card,
    Table,
    CardContent,
    Divider, TableHead, TableRow, TableCell, TableBody
} from "@mui/material";
import { useLocation } from "react-router-dom";
import {  Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from './FileContext';

const API_URL = process.env.REACT_APP_API_URL;

interface CausalResult {
  deviation: string;
  dimension: string;
  ate: number;
  p_value: number;
  error?: string;
}

type CriticalityLevel = 'very positive' | 'positive' | 'negative' | 'very negative';

interface CriticalityRule {
  min: number;
  max: number;
  label: CriticalityLevel;
}

interface CriticalityMap {
  [dim: string]: CriticalityRule[];
}
type Dimension = "time" | "costs" | "quality" | "outcome" | "compliance";
const CriticalityConfigurator: React.FC<{
  criticalityMap: CriticalityMap;
  setCriticalityMap: React.Dispatch<React.SetStateAction<CriticalityMap>>;
  dimensions: string[];
}> = ({ criticalityMap, setCriticalityMap, dimensions }) => {
  const handleChange = (dim: string, idx: number, field: 'min' | 'max' | 'label', value: any) => {
    setCriticalityMap((prev) => {
      const newMap = { ...prev };
      newMap[dim][idx] = { ...newMap[dim][idx], [field]: field === 'label' ? value : Number(value) };
      return newMap;
    });
  };

  return (
    <Box mt={6}>
      <Typography variant="h6" gutterBottom>
        Define Criticality per Dimension
      </Typography>

      {dimensions.map((dim) => (
        <Box key={dim} mb={4}>
          <Typography variant="subtitle1">{dim}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Min</TableCell>
                <TableCell>Max</TableCell>
                <TableCell>Label</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(criticalityMap[dim] || []).map((rule, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <input
                      type="number"
                      value={rule.min === -Infinity ? '' : rule.min}
                      onChange={(e) => handleChange(dim, idx, 'min', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      value={rule.max === Infinity ? '' : rule.max}
                      onChange={(e) => handleChange(dim, idx, 'max', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      value={rule.label}
                      onChange={(e) => handleChange(dim, idx, 'label', e.target.value)}
                    >
                      <option value="very positive">very positive</option>
                      <option value="positive">positive</option>
                      <option value="negative">negative</option>
                      <option value="very negative">very negative</option>
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ))}
    </Box>
  );
};


const CausalResults: React.FC = () => {
  const navigate = useNavigate();
  const {
    setSelectedDeviations,
    setSelectedDimensions,
    setUniqueSequences,
    setActivityDeviations,
    setOutcomeBins,
    setDesiredOutcomes,
    setAttributeConformance,
    setAmountConformanceData,
    // add other context setters if needed
  } = useFileContext();

  const handleReset = () => {
    // Clear all relevant context state
    setSelectedDeviations([]);
    setSelectedDimensions([]);
    setUniqueSequences([]);
    setActivityDeviations({ deviations: [], total_traces: 0 });
    setOutcomeBins([]);
    setDesiredOutcomes([]);
    setAttributeConformance({});
    setAmountConformanceData([]);
    // navigate back to first page
    navigate('/');
  };
  const location = useLocation();

  const selectedDeviations = location.state?.selectedDeviations || [];
  const selectedDimensions = location.state?.selectedDimensions || [];
  const negativeIsGood = ['time',  'cost'];
  const positiveIsGood = ['outcome', 'quality', 'compliance'];
  const getMaxAbsEffect = (results: any[]) => {
          return Math.max(...results.map(r => Math.abs(r.ate)), 1);
        };
      const getCellColor = (
          dimension: string,
          ate: number,
          maxAbs: number
        ) => {
          if (ate === undefined || maxAbs === 0) return '#fff';

          const intensity = Math.max(Math.min(Math.abs(ate) / maxAbs, 1), 0.15); // min opacity 0.15

          const isNegativeGood = ['time', 'costs'].includes(dimension.toLowerCase());
          const isPositiveGood = ['outcome', 'quality', 'compliance'].includes(dimension.toLowerCase());

          let isGood = false;

          if (isNegativeGood) {
            isGood = ate < 0;
          } else if (isPositiveGood) {
            isGood = ate > 0;
          } else {
            isGood = ate > 0;
          }

          return isGood
            ? `rgba(76,175,80,${intensity})` // green
            : `rgba(211,47,47,${intensity})`; // red
        };

  const [results, setResults] = useState<CausalResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [criticalityMap, setCriticalityMap] = useState<CriticalityMap>(() => {
      const map: CriticalityMap = {};
      selectedDimensions.forEach((dim: Dimension) => {
        map[dim] = [
          { min: -Infinity, max: -1000, label: 'very positive' },
          { min: -1000, max: 0, label: 'positive' },
          { min: 0, max: 1000, label: 'negative' },
          { min: 1000, max: Infinity, label: 'very negative' },
        ];
      });
      return map;
    });
  useEffect(() => {
      const fetchData = async () => {
        try {
          const res = await fetch(`${API_URL}/api/compute-causal-effects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviations: selectedDeviations.map((d: any) => d.column),
              dimensions: selectedDimensions
            })
          });

          console.log("HTTP status:", res.status);

          const text = await res.text();
          console.log("Raw response:", text);

          const data = JSON.parse(text);
          console.log("Parsed response:", data);

          setResults(data.results || []);
        } catch (err) {
          console.error("Fetch failed:", err);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, []);

  useEffect(() => {
      console.log("Selected deviations:", selectedDeviations);
      console.log("Selected dimensions:", selectedDimensions);
    }, []);

  if (loading) {
    return (
      <Box mt={6} textAlign="center">
        <CircularProgress />
        <Typography mt={2}>Computing causal effects...</Typography>
      </Box>
    );
  }
  const maxAbsEffect = getMaxAbsEffect(results);

    const dimensions = Array.from(
      new Set(results.map(r => r.dimension))
    );

    const deviations = Array.from(
      new Set(results.map(r => r.deviation))
    );
  return (
    <Box sx={{ width: "90vw", maxWidth: 1000, margin: "0 auto", mt: 4 }}>

      {/* HEADER */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h5">Causal Effects</Typography>

        <Button variant="outlined" color="secondary" onClick={handleReset}>
          Reset & Start Over
        </Button>
      </Box>

      <Typography variant="h5" gutterBottom>
        Average Treatment Effects (ATE)
      </Typography>

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
                    r => r.dimension === dim && r.deviation === dev
                  );

                  if (!result) {
                    return <TableCell key={dev} />;
                  }

                  const bgColor = getCellColor(
                    dim,
                    result.ate,
                    maxAbsEffect
                  );

                  return (
                    <TableCell
                      key={dev}
                      align="center"
                      style={{ backgroundColor: bgColor, minWidth: 80 }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {result.ate !== undefined ? result.ate.toFixed(2) : '-'}{' '}
                        <Typography component="span" variant="caption">
                          ({result.p_value !== undefined ? result.p_value.toFixed(3) : '-'})
                        </Typography>
                      </Typography>
                    </TableCell>

                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CriticalityConfigurator
        criticalityMap={criticalityMap}
        setCriticalityMap={setCriticalityMap}
        dimensions={selectedDimensions}
      />

    <Button
      variant="contained"
      sx={{ mt: 4 }}
      onClick={() =>
        navigate('/criticality-results', {
          state: {
            results,
            criticalityMap
          }
        })
      }
    >
      Continue to Criticality Overview
    </Button>

    </Box>



  );
};

export default CausalResults;
