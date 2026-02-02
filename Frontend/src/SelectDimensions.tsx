import React from 'react';
import {
  Box,
  Typography,
  Checkbox,
  Button,
  FormControlLabel
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from './FileContext';

const dimensions = [
  'Role',
  'Resource',
  'Requested Amount',
  'Outcome',
  'Event Attribute'
];

const SelectDimensions: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedDimensions,
    setSelectedDimensions,
    selectedDeviations
  } = useFileContext();

  const handleToggle = (dimension: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dimension)
        ? prev.filter((d) => d !== dimension)
        : [...prev, dimension]
    );
  };

  return (
    <Box sx={{ width: 600, margin: '0 auto', mt: 6 }}>
      <Typography variant="h5" gutterBottom>
        Select Dimensions to Analyze
      </Typography>

      <Typography variant="body2" sx={{ mb: 3 }}>
        Selected deviations: {selectedDeviations.length}
      </Typography>

      {dimensions.map((dimension) => (
        <FormControlLabel
          key={dimension}
          control={
            <Checkbox
              checked={selectedDimensions.includes(dimension)}
              onChange={() => handleToggle(dimension)}
            />
          }
          label={dimension}
        />
      ))}

      <Box mt={4}>
        <Button
          variant="contained"
          disabled={selectedDimensions.length === 0}
          onClick={() => navigate('/analysis')}
        >
          Continue to Analysis
        </Button>
      </Box>
    </Box>
  );
};

export default SelectDimensions;
