import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Divider
} from "@mui/material";
import { useLocation } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL;

interface CausalResult {
  deviation: string;
  dimension: string;
  ate?: number;
  p_value?: number;
  error?: string;
}

const CausalResults: React.FC = () => {
  const location = useLocation();

  const selectedDeviations = location.state?.selectedDeviations || [];
  const selectedDimensions = location.state?.selectedDimensions || [];

  const [results, setResults] = useState<CausalResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/compute-causal-effects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        deviations: selectedDeviations.map((d: any) => d.activity),
        dimensions: selectedDimensions
      })
    })
      .then(res => res.json())
      .then(data => {
        setResults(data.results);
        setLoading(false);
      });
  }, []);

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
      <Typography variant="h5" gutterBottom>
        Average Treatment Effects (ATE) srhf
      </Typography>

      <Divider sx={{ my: 3 }} />

      {results.map((r, index) => (
        <Card key={index} sx={{ mb: 2 }}>
          <CardContent>
            <Typography fontWeight="bold">
              {r.deviation} → {r.dimension}
            </Typography>

            {r.error ? (
              <Typography color="error">{r.error}</Typography>
            ) : (
              <>
                <Typography>
                  ATE: <b>{r.ate?.toFixed(4)}</b>
                </Typography>
                <Typography>
                  p-value: <b>{r.p_value?.toFixed(4)}</b>
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default CausalResults;
