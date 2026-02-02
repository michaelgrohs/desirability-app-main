import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Checkbox,
  Button
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from './FileContext';

interface DeviationItem {
  activity: string;
  count: number;
}

interface DeviationData {
  skips: DeviationItem[];
  insertions: DeviationItem[];
}

interface SelectedDeviation {
  activity: string;
  type: 'skip' | 'insertion';
}

const DeviationOverview: React.FC = () => {
  const navigate = useNavigate();
  const { selectedDeviations, setSelectedDeviations } = useFileContext();

  const [data, setData] = useState<DeviationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.REACT_APP_API_URL;
  console.log('API URL:', apiUrl); // <--- debug, should print http://127.0.0.1:5000

  // =========================
  // Fetch Deviation Data
  // =========================
  useEffect(() => {
    if (!apiUrl) {
      setError('API URL is not defined. Check your .env file and restart React.');
      setLoading(false);
      return;
    }

    fetch(`${apiUrl}/api/deviation-overview`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch deviation overview');
        }
        return json;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl]);

  // =========================
  // Toggle Selection
  // =========================
  const handleToggle = (activity: string, type: 'skip' | 'insertion') => {
    setSelectedDeviations((prev: SelectedDeviation[]) => {
      const exists = prev.find(
        (d) => d.activity === activity && d.type === type
      );

      if (exists) {
        return prev.filter(
          (d) => !(d.activity === activity && d.type === type)
        );
      }

      return [...prev, { activity, type }];
    });
  };

  // =========================
  // Render List
  // =========================
  const renderList = (
    items: DeviationItem[],
    type: 'skip' | 'insertion'
  ) => {
    if (!items || items.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No deviations found.
        </Typography>
      );
    }

    const maxCount = Math.max(...items.map((i) => i.count));

    return items.map((item, index) => (
      <Box key={index} sx={{ mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <Checkbox
              checked={selectedDeviations.some(
                (d) => d.activity === item.activity && d.type === type
              )}
              onChange={() => handleToggle(item.activity, type)}
            />
            <Typography>{item.activity}</Typography>
          </Box>

          <Typography fontWeight="bold">
            {item.count}
          </Typography>
        </Box>

        {/* Relative bar */}
        <Box
          sx={{
            height: 6,
            backgroundColor: '#eee',
            borderRadius: 2,
            mt: 0.5,
          }}
        >
          <Box
            sx={{
              height: 6,
              width: `${(item.count / maxCount) * 100}%`,
              backgroundColor:
                type === 'skip' ? '#d32f2f' : '#1976d2',
              borderRadius: 2,
            }}
          />
        </Box>
      </Box>
    ));
  };

  return (
    <Box
      sx={{
        width: '90vw',
        maxWidth: 1100,
        margin: '0 auto',
        mt: 4,
      }}
    >
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        gap={1}
        mb={4}
      >
        <Typography variant="h5">
          Select Deviations of Interest
        </Typography>
        <Tooltip
          title="Select skipped (model moves) and inserted (log moves) activities to analyze them in the next step."
          arrow
        >
          <IconButton>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Loading */}
      {loading && (
        <Box display="flex" justifyContent="center" mt={6}>
          <CircularProgress />
        </Box>
      )}

      {/* Error */}
      {error && (
        <Typography color="error" align="center">
          {error}
        </Typography>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          <Box display="flex" gap={4}>
            {/* Skipped Activities */}
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Skipped Activities
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Model moves
                </Typography>
                <Divider sx={{ my: 2 }} />
                {renderList(data.skips, 'skip')}
              </CardContent>
            </Card>

            {/* Inserted Activities */}
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Inserted Activities
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Log moves
                </Typography>
                <Divider sx={{ my: 2 }} />
                {renderList(data.insertions, 'insertion')}
              </CardContent>
            </Card>
          </Box>

          {/* Continue Button */}
          <Box display="flex" justifyContent="center" mt={4}>
            <Button
              variant="contained"
              size="large"
              disabled={selectedDeviations.length === 0}
              onClick={() => navigate('/select-dimensions')}
            >
              Continue
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default DeviationOverview;
