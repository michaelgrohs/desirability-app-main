import React from 'react';
import { Box, Typography, Button, Stack, Tooltip, IconButton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, Legend } from 'recharts';
import { useFileContext } from './FileContext';
import InfoIcon from '@mui/icons-material/Info';

const ActivityStats: React.FC = () => {
  const navigate = useNavigate();
  const { extractedElements, activityDeviations } = useFileContext();
const deviations = activityDeviations.deviations;


const activityStats = extractedElements
  .map((element: any) => {
    const deviation = deviations.find((d) => d.name === element.name);
    const skipped = deviation?.skipped_percent || 0;
    const inserted = deviation?.inserted_percent || 0;
    return {
      name: element.name,
      skipped,
      inserted,
      total: skipped + inserted,
    };
  })

  .sort((a, b) => b.total - a.total) // descending sort by total
  .map(({ name, skipped, inserted }) => ({
    name,
    skipped,
    inserted,
  })); // remove the 'total' key for final rendering

  

  const sharedHeight = activityStats.length * 40;

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 900,
        margin: '0 auto',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
      }}
    >
      <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
        <Typography variant="h4" gutterBottom>
          Activity Deviations
        </Typography>
        <Tooltip title="This view shows the number of times each activity has been skipped or inserted. Activities are sorted in descending order based on their total number of deviations, with those exhibiting the most deviations appearing first." arrow>
          <IconButton>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box
        sx={{
          width: '100%',
          height: 'auto',
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
        }}
      >
        <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', margin: '16px 0' }}>
        Percentage of traces where activity was skipped or inserted
        </Typography>

        <BarChart
          width={800}
          height={sharedHeight}
          data={activityStats}
          layout="vertical"
          margin={{ top: 20, right: 20, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
          <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              tickFormatter={(tick) => `${tick}%`}
          />

          <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12 }} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ddd' }}
            labelStyle={{ fontWeight: 'bold' }}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}


          />
          <Legend verticalAlign="top" align="center" wrapperStyle={{ paddingBottom: 20 }} />
          <Bar dataKey="skipped" name="Skipped" fill="#8b0000">
            {activityStats.map((entry, index) => (
              <Cell key={`cell-skipped-${index}`} fill="#8b0000" />
            ))}
          </Bar>
          <Bar dataKey="inserted" name="Inserted" fill="#b8860b">
            {activityStats.map((entry, index) => (
              <Cell key={`cell-inserted-${index}`} fill="#b8860b" />
            ))}
          </Bar>
        </BarChart>
      </Box>

      <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ marginTop: 4, padding: 0, position: 'relative' }}>
        <Button
          variant="contained"
          color="primary"
          sx={{ marginLeft: 2, fontSize: '1.5rem', fontWeight: 'bold', backgroundColor: '#1565c0', marginTop: '24px' }}
          onClick={() => navigate('/view-bpmn')}
        >
          ←
        </Button>
        <Button
          variant="contained"
          color="primary"
          sx={{ marginRight: 2, fontSize: '1.5rem', fontWeight: 'bold', backgroundColor: '#1565c0', marginTop: '24px' }}
          onClick={() => navigate('/heatmap-aggr')}
        >
          →
        </Button>
      </Stack>
    </Box>
  );
};

export default ActivityStats;























