import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Alert,
} from '@mui/material';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:1904";

// Self-contained reference view of the uploaded process model. Deliberately does NOT
// depend on FileContext — it fetches straight from the backend so it works correctly
// when opened in a fresh browser tab (its whole point: stay open alongside the wizard
// without depending on that tab's in-memory state).
const ModelReference: React.FC = () => {
  const [modelType, setModelType] = useState<'bpmn' | 'pnml' | 'pnml_info' | 'declarative' | 'declarative-model' | null>(null);
  const [modelContent, setModelContent] = useState<string | null>(null);
  const [modelConstraints, setModelConstraints] = useState<any[]>([]);
  const [modelInfo, setModelInfo] = useState<{ activities: string[]; n_places: number; n_transitions: number; n_arcs: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bpmnContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/model-content`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load model');
        return json;
      })
      .then((data) => {
        setModelType(data.type);
        if (data.type === 'declarative' || data.type === 'declarative-model') {
          setModelConstraints(data.constraints || []);
        } else if (data.type === 'pnml_info') {
          setModelInfo({ activities: data.activities || [], n_places: data.n_places, n_transitions: data.n_transitions, n_arcs: data.n_arcs });
        } else {
          setModelContent(data.content);
        }
      })
      .catch((err) => setError(err.message || 'Failed to load model'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (modelType === 'bpmn' && modelContent && bpmnContainerRef.current) {
      if (viewerRef.current) viewerRef.current.destroy();
      const viewer = new NavigatedViewer({ container: bpmnContainerRef.current });
      viewerRef.current = viewer;
      viewer.importXML(modelContent).then(() => {
        (viewer.get('canvas') as any).zoom('fit-viewport');
      }).catch((err: any) => console.error('BPMN render error:', err));
      return () => {
        viewer.destroy();
        viewerRef.current = null;
      };
    }
  }, [modelType, modelContent]);

  return (
    <Box sx={{ width: '90vw', maxWidth: 1200, margin: '0 auto', mt: 4, mb: 6 }}>
      <Typography variant="h5" gutterBottom>Process Model Reference</Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        This is a read-only reference view of your uploaded process model. Keep this tab open
        alongside the analysis wizard so you can check activity names and the process structure
        without losing your place.
      </Alert>

      {loading && (
        <Box display="flex" alignItems="center" gap={1} sx={{ mt: 4 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Loading model…</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {error}. Make sure a model has been uploaded in the main analysis tab.
        </Alert>
      )}

      {!loading && !error && modelType === 'bpmn' && modelContent && (
        <Paper sx={{ p: 2 }}>
          <Box
            ref={bpmnContainerRef}
            sx={{ width: '100%', height: '75vh', border: '1px solid #eee', borderRadius: 1, overflow: 'hidden' }}
          />
        </Paper>
      )}

      {!loading && !error && modelType === 'pnml' && modelContent && (
        <Paper sx={{ p: 2 }}>
          <Box
            sx={{
              width: '100%',
              maxHeight: '75vh',
              overflow: 'auto',
              border: '1px solid #eee',
              borderRadius: 1,
              '& svg': { width: '100%', height: 'auto' },
            }}
            dangerouslySetInnerHTML={{ __html: modelContent }}
          />
        </Paper>
      )}

      {!loading && !error && modelType === 'pnml_info' && modelInfo && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Mined Process Model</Typography>
          <Box display="flex" gap={3} mb={2}>
            <Chip label={`${modelInfo.n_transitions} transitions`} size="small" variant="outlined" />
            <Chip label={`${modelInfo.n_places} places`} size="small" variant="outlined" />
            <Chip label={`${modelInfo.n_arcs} arcs`} size="small" variant="outlined" />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Activities in model ({modelInfo.activities.length}):
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {modelInfo.activities.map((act) => (
              <Chip key={act} label={act} size="small" sx={{ fontSize: 11 }} />
            ))}
          </Box>
        </Paper>
      )}

      {!loading && !error && (modelType === 'declarative' || modelType === 'declarative-model') && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            {modelType === 'declarative-model'
              ? `Uploaded Declarative Model (${modelConstraints.length.toLocaleString()} constraints)`
              : `Mined Declarative Model (${modelConstraints.length.toLocaleString()} constraints)`}
          </Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: '75vh', overflowY: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Operand A</TableCell>
                  <TableCell>Operand B</TableCell>
                  {modelType === 'declarative-model' && <TableCell>Activation (A.)</TableCell>}
                  {modelType === 'declarative-model' && <TableCell>Target (T.)</TableCell>}
                  {modelType === 'declarative-model' && <TableCell>Time Window</TableCell>}
                  {modelType !== 'declarative-model' && <TableCell align="right">Support</TableCell>}
                  {modelType !== 'declarative-model' && <TableCell align="right">Confidence</TableCell>}
                  {modelType === 'declarative-model' && <TableCell align="right">Activations</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {modelConstraints.map((c: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell sx={{ fontSize: 11 }}>{c.type}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{c.op_0}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{c.op_1 || '—'}</TableCell>
                    {modelType === 'declarative-model' && <TableCell sx={{ fontSize: 10 }}>{c.activation_condition || '—'}</TableCell>}
                    {modelType === 'declarative-model' && <TableCell sx={{ fontSize: 10 }}>{c.correlation_condition || '—'}</TableCell>}
                    {modelType === 'declarative-model' && <TableCell sx={{ fontSize: 10 }}>{c.time_condition ? c.time_condition.raw : '—'}</TableCell>}
                    {modelType !== 'declarative-model' && <TableCell align="right" sx={{ fontSize: 11 }}>{c.support != null ? `${(c.support * 100).toFixed(1)}%` : '—'}</TableCell>}
                    {modelType !== 'declarative-model' && <TableCell align="right" sx={{ fontSize: 11 }}>{c.confidence != null ? `${(c.confidence * 100).toFixed(1)}%` : '—'}</TableCell>}
                    {modelType === 'declarative-model' && <TableCell align="right" sx={{ fontSize: 11 }}>{c.total_activations ?? '—'}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default ModelReference;
