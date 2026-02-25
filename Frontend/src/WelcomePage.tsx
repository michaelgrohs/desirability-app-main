import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  Paper,
  CircularProgress,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Checkbox,
  Slider,
  Tooltip,
  IconButton,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useNavigate } from 'react-router-dom';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useBottomNav } from './BottomNavContext';
import { useFileContext, ConformanceMode } from './FileContext';

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

const WelcomePage: React.FC = () => {
  const [mode, setMode] = useState<ConformanceMode>('bpmn');
  const [declSubMode, setDeclSubMode] = useState<'mine' | 'upload'>('mine');
  const [bpmnFile, setBpmnFile] = useState<File | null>(null);
  const [xesFile, setXesFile] = useState<File | null>(null);
  const [declFile, setDeclFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Declarative-specific state
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [minSupport, setMinSupport] = useState<number>(0.1);

  const navigate = useNavigate();
  const { setContinue, setHideBack } = useBottomNav();
  const { resetAll, setConformanceMode } = useFileContext();

  useEffect(() => {
    setHideBack(true);
    return () => setHideBack(false);
  }, [setHideBack]);

  useEffect(() => {
    if (isReady) {
      setContinue({ label: "Next", onClick: () => navigate('/overview') });
    } else {
      setContinue(null);
    }
    return () => setContinue(null);
  }, [isReady, navigate, setContinue]);

  // Fetch available templates on mount
  useEffect(() => {
    fetch(`${API_URL}/api/available-templates`)
      .then(res => res.json())
      .then(data => {
        setAvailableTemplates(data.templates || []);
        setSelectedTemplates(data.templates || []);
      })
      .catch(err => console.error("Failed to fetch templates:", err));
  }, []);

  const handleFileChange = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      setFile: React.Dispatch<React.SetStateAction<File | null>>
    ) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        setFile(target.files[0]);
      }
    };

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: ConformanceMode | null) => {
    if (newMode) {
      setMode(newMode);
      setIsReady(false);
      setErrorMsg(null);
    }
  };

  const handleDeclSubModeChange = (_: React.MouseEvent<HTMLElement>, newSub: 'mine' | 'upload' | null) => {
    if (newSub) {
      setDeclSubMode(newSub);
      setIsReady(false);
      setErrorMsg(null);
    }
  };

  const handleTemplateToggle = (template: string) => {
    setSelectedTemplates(prev =>
      prev.includes(template)
        ? prev.filter(t => t !== template)
        : [...prev, template]
    );
  };

  const allSelected = availableTemplates.length > 0 && availableTemplates.every(t => selectedTemplates.includes(t));

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedTemplates([]);
    } else {
      setSelectedTemplates([...availableTemplates]);
    }
  };

  const handleUpload = async () => {
    if (mode === 'bpmn') {
      if (!bpmnFile || !xesFile) return;
    } else if (declSubMode === 'upload') {
      if (!xesFile || !declFile) return;
    } else {
      if (!xesFile) return;
    }

    resetAll();
    setIsProcessing(true);
    setIsReady(false);
    setErrorMsg(null);

    // Reset backend cache before uploading
    try {
      await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    } catch (e) {
      console.warn("Failed to reset backend cache:", e);
    }

    try {
      if (mode === 'bpmn') {
        const formData = new FormData();
        formData.append('bpmn', bpmnFile!);
        formData.append('xes', xesFile!);

        const response = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        console.log("Upload response:", data);

        if (response.ok) {
          setConformanceMode('bpmn');
          setIsReady(true);
        } else {
          const msg = data.error || "Upload failed";
          console.error("Upload failed:", msg);
          if (data.traceback) console.error("Backend traceback:\n", data.traceback);
          setErrorMsg(msg);
        }
      } else if (mode === 'declarative' && declSubMode === 'upload') {
        // Declarative model upload mode
        const formData = new FormData();
        formData.append('xes', xesFile!);
        formData.append('decl', declFile!);

        const response = await fetch(`${API_URL}/upload-declarative-model`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        console.log("Declarative model upload response:", data);

        if (response.ok) {
          setConformanceMode('declarative-model');
          setIsReady(true);
        } else {
          const msg = data.error || "Upload failed";
          console.error("Upload failed:", msg);
          if (data.traceback) console.error("Backend traceback:\n", data.traceback);
          setErrorMsg(msg);
        }
      } else {
        // Declarative mine-from-log mode
        const formData = new FormData();
        formData.append('xes', xesFile!);
        formData.append('templates', JSON.stringify(selectedTemplates));
        formData.append('min_support', String(minSupport));

        const response = await fetch(`${API_URL}/upload-declarative`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        console.log("Declarative upload response:", data);

        if (response.ok) {
          setConformanceMode('declarative');
          setIsReady(true);
        } else {
          const msg = data.error || "Upload failed";
          console.error("Upload failed:", msg);
          if (data.traceback) console.error("Backend traceback:\n", data.traceback);
          setErrorMsg(msg);
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      setErrorMsg(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const canUpload = mode === 'bpmn'
    ? (!!bpmnFile && !!xesFile && !isProcessing)
    : mode === 'declarative' && declSubMode === 'upload'
      ? (!!xesFile && !!declFile && !isProcessing)
      : (!!xesFile && selectedTemplates.length > 0 && !isProcessing);

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', p: 4 }}>
      <Box display="flex" alignItems="center" justifyContent="center" mb={1}>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          Conformance Analysis
        </Typography>
        <Tooltip
          title="Upload your event log and (optionally) process model to begin conformance analysis.
          You have three options:
          1. Trace Alignment: Upload a BPMN/PNML process model and an event log. Deviations are identified by aligning each trace to the model — skipped activities (expected but absent) or inserted activities (present but not in model).
          2. Declarative — Mine from Log: Upload an event log only. A declarative model (behavioral constraints) is automatically mined using DECLARE templates; select constraint types and a minimum support threshold. Deviations are violations of mined constraints.
          3. Declarative — Upload Model: Upload an event log and a pre-existing .decl model file. Conformance is checked directly against the uploaded model; deviations are violations of its constraints."
          arrow
          placement="right"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <InfoIcon fontSize="small" color="action" />
          </IconButton>
        </Tooltip>
      </Box>

      <Stack spacing={3}>
        {/* Mode Toggle */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          fullWidth
          sx={{ mb: 1 }}
        >
          <ToggleButton value="bpmn">Trace Alignment</ToggleButton>
          <ToggleButton value="declarative">Declarative Conformance Checking</ToggleButton>
        </ToggleButtonGroup>

        {/* Declarative sub-mode selection */}
        {mode === 'declarative' && (
          <Paper sx={{ p: 2, backgroundColor: '#f9f9f9' }}>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Choose declarative approach:
            </Typography>
            <ToggleButtonGroup
              value={declSubMode}
              exclusive
              onChange={handleDeclSubModeChange}
              fullWidth
              size="small"
            >
              <ToggleButton value="mine">
                Mine Model from Log
              </ToggleButton>
              <ToggleButton value="upload">
                Upload .decl Model
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {declSubMode === 'mine'
                ? "A declarative model will be automatically mined from your event log using DECLARE templates."
                : "Upload a pre-existing .decl model and check your event log for conformance against it."}
            </Typography>
          </Paper>
        )}

        {/* BPMN mode: process model upload */}
        {mode === 'bpmn' && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">Upload Process Model</Typography>
            <TextField
              type="file"
              inputProps={{ accept: '.bpmn,.pnml' }}
              onChange={(e) => handleFileChange(e, setBpmnFile)}
              fullWidth
            />
          </Paper>
        )}

        {/* Event log upload (all modes) */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Upload Event Log</Typography>
          <TextField
            type="file"
            inputProps={{ accept: '.xes,.csv,.xes.gz' }}
            onChange={(e) => handleFileChange(e, setXesFile)}
            fullWidth
          />
        </Paper>

        {/* Declarative upload mode: .decl model file */}
        {mode === 'declarative' && declSubMode === 'upload' && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">Upload Declarative Model</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Upload a .decl file containing DECLARE constraints.
            </Typography>
            <TextField
              type="file"
              inputProps={{ accept: '.decl' }}
              onChange={(e) => handleFileChange(e, setDeclFile)}
              fullWidth
            />
          </Paper>
        )}

        {/* Declarative mine mode: template selection + min_support */}
        {mode === 'declarative' && declSubMode === 'mine' && (
          <>
            <Paper sx={{ p: 3, textAlign: 'left' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Select Constraint Templates</Typography>
                <Button size="small" variant="outlined" onClick={handleSelectAll}>
                  {allSelected ? 'De-Select All' : 'Select All'}
                </Button>
              </Box>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              }}>
                {availableTemplates.map(template => (
                  <FormControlLabel
                    key={template}
                    control={
                      <Checkbox
                        checked={selectedTemplates.includes(template)}
                        onChange={() => handleTemplateToggle(template)}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{template}</Typography>}
                  />
                ))}
              </Box>
            </Paper>

            <Paper sx={{ p: 3, textAlign: 'left' }}>
              <Typography variant="h6" gutterBottom>Minimum Support</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Minimum fraction of traces that must satisfy a constraint: {minSupport.toFixed(2)}
              </Typography>
              <Slider
                value={minSupport}
                onChange={(_, value) => setMinSupport(value as number)}
                min={0}
                max={1}
                step={0.01}
                valueLabelDisplay="auto"
              />
            </Paper>
          </>
        )}

        {errorMsg && (
          <Typography color="error" variant="body2">{errorMsg}</Typography>
        )}

        {!isReady && (
          <Box>
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!canUpload}
              startIcon={isProcessing ? <CircularProgress size={20} /> : <UploadFileIcon />}
            >
              {isProcessing
                ? (mode === 'bpmn'
                    ? "Computing Alignments..."
                    : declSubMode === 'upload'
                      ? "Checking Conformance..."
                      : "Mining Constraints...")
                : "Upload & Compute"
              }
            </Button>
            {isProcessing && (
              <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default WelcomePage;
