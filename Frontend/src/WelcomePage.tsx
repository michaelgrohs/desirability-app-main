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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate } from 'react-router-dom';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useBottomNav } from './BottomNavContext';
import { useFileContext, ConformanceMode } from './FileContext';

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

const WelcomePage: React.FC = () => {
  const [mode, setMode] = useState<ConformanceMode>('bpmn');
  const [declSubMode, setDeclSubMode] = useState<'mine' | 'upload'>('upload');
  const [bpmnSubMode, setBpmnSubMode] = useState<'upload' | 'mine'>('upload');
  const [miningAlgorithm, setMiningAlgorithm] = useState<'inductive_infrequent' | 'heuristics' | 'alpha'>('inductive_infrequent');
  const [noiseThreshold, setNoiseThreshold] = useState<number>(0.2);
  const [bpmnFile, setBpmnFile] = useState<Blob | null>(null);
  const [bpmnFileName, setBpmnFileName] = useState<string>('');
  const [xesFile, setXesFile] = useState<Blob | null>(null);
  const [xesFileName, setXesFileName] = useState<string>('');
  const [declFile, setDeclFile] = useState<Blob | null>(null);
  const [declFileName, setDeclFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [miningPhase, setMiningPhase] = useState<'mining' | 'computing' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Declarative-specific state
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [minSupport, setMinSupport] = useState<number>(0.1);
  const [minedDeclFilename, setMinedDeclFilename] = useState<string | null>(null);

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

  const [backendReady, setBackendReady] = useState(false);

  // Poll until backend is reachable, then fetch templates
  useEffect(() => {
    let cancelled = false;
    const tryFetch = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`${API_URL}/api/available-templates`);
          const data = await res.json();
          if (!cancelled) {
            setAvailableTemplates(data.templates || []);
            setSelectedTemplates(data.templates || []);
            setBackendReady(true);
          }
          return;
        } catch {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    };
    tryFetch();
    return () => { cancelled = true; };
  }, []);

  const handleFileChange = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      setBlob: React.Dispatch<React.SetStateAction<Blob | null>>,
      setName: React.Dispatch<React.SetStateAction<string>>,
    ) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        setName(file.name);
        // Read into memory immediately so Chrome can't detect on-disk changes later
        file.arrayBuffer().then(buf => setBlob(new Blob([buf], { type: file.type })));
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

  const handleBpmnSubModeChange = (_: React.MouseEvent<HTMLElement>, newSub: 'upload' | 'mine' | null) => {
    if (newSub) {
      setBpmnSubMode(newSub);
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
    if (mode === 'bpmn' && bpmnSubMode === 'upload') {
      if (!bpmnFile || !xesFile) return;
    } else if (mode === 'bpmn' && bpmnSubMode === 'mine') {
      if (!xesFile) return;
    } else if (declSubMode === 'upload') {
      if (!xesFile || !declFile) return;
    } else {
      if (!xesFile) return;
    }

    resetAll();
    setIsProcessing(true);
    setIsReady(false);
    setErrorMsg(null);
    let keepSpinner = false;

    // Reset backend cache before uploading
    try {
      await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    } catch (e) {
      console.warn("Failed to reset backend cache:", e);
    }

    try {
      if (mode === 'bpmn' && bpmnSubMode === 'upload') {
        const formData = new FormData();
        formData.append('bpmn', bpmnFile!, bpmnFileName);
        formData.append('xes', xesFile!, xesFileName);

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
      } else if (mode === 'bpmn' && bpmnSubMode === 'mine') {
        const formData = new FormData();
        formData.append('xes', xesFile!, xesFileName);
        formData.append('algorithm', miningAlgorithm);
        formData.append('noise_threshold', String(noiseThreshold));

        const response = await fetch(`${API_URL}/upload-mine-model`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        console.log("Mine-model response:", data);

        if (response.ok) {
          setConformanceMode('bpmn');
          // Mining + alignments run fully in the background. Poll until ready.
          setMiningPhase('mining');
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`${API_URL}/api/alignment-status`);
              const { status, error } = await statusRes.json();
              if (status === 'ready') {
                clearInterval(pollInterval);
                setMiningPhase(null);
                setIsReady(true);
                setIsProcessing(false);
              } else if (status === 'error') {
                clearInterval(pollInterval);
                setMiningPhase(null);
                setErrorMsg(error || 'Process mining failed');
                setIsProcessing(false);
              } else if (status === 'computing') {
                setMiningPhase('computing');
              } else {
                setMiningPhase('mining');
              }
            } catch (e) {
              console.warn("Polling error:", e);
            }
          }, 2000);
          // Spinner stays alive; finally block must not clear it
          keepSpinner = true;
          return;
        } else {
          const msg = data.error || "Model mining failed";
          console.error("Mining failed:", msg);
          if (data.traceback) console.error("Backend traceback:\n", data.traceback);
          setErrorMsg(msg);
        }
      } else if (mode === 'declarative' && declSubMode === 'upload') {
        // Declarative model upload mode
        const formData = new FormData();
        formData.append('xes', xesFile!, xesFileName);
        formData.append('decl', declFile!, declFileName);

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
        formData.append('xes', xesFile!, xesFileName);
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
          if (data.decl_filename) setMinedDeclFilename(data.decl_filename);
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
      if (!keepSpinner) setIsProcessing(false);
    }
  };

  const canUpload = mode === 'bpmn' && bpmnSubMode === 'upload'
    ? (!!bpmnFile && !!xesFile && !isProcessing)
    : mode === 'bpmn' && bpmnSubMode === 'mine'
      ? (!!xesFile && !isProcessing)
      : mode === 'declarative' && declSubMode === 'upload'
        ? (!!xesFile && !!declFile && !isProcessing)
        : (!!xesFile && selectedTemplates.length > 0 && !isProcessing);

  if (!backendReady) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Connecting to backend...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', p: 4 }}>
      <Box display="flex" alignItems="center" justifyContent="center" mb={1}>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          Conformance Analysis
        </Typography>
        <Tooltip
          title="Upload your event log and process model to begin conformance analysis. You have four options:
1. Trace Alignment — Upload Model: Upload a BPMN/PNML process model and an event log. Deviations are identified by aligning each trace to the model.
2. Trace Alignment — Mine Model: Upload an event log only. A process model is automatically discovered (IMf, Heuristics, or Alpha Miner) and used for trace alignment.
3. Declarative — Mine from Log: Upload an event log only. A declarative model is mined using DECLARE templates; select constraint types and a minimum support threshold.
4. Declarative — Upload Model: Upload an event log and a .decl model file. Conformance is checked against the uploaded model."
          arrow
          placement="right"
        >
          <IconButton size="small" sx={{ ml: 1 }}>
            <InfoIcon fontSize="small" color="action" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 0.5, textAlign: 'left' }}>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What you see</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
              Four conformance checking modes, each requiring different inputs:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                <strong>Trace Alignment — Upload Model:</strong> Upload a BPMN or PNML process model + an event log. Deviations are found by aligning each trace to the model (skipped and inserted activities).
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                <strong>Trace Alignment — Mine Model:</strong> Upload an event log only. A process model is automatically discovered (Inductive Miner, Heuristics, or Alpha Miner) and used for trace alignment.
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                <strong>Declarative — Mine from Log:</strong> Upload an event log only. A declarative DECLARE model is mined from the log. Choose constraint templates and a minimum support threshold.
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                <strong>Declarative — Upload Model:</strong> Upload an event log + a pre-existing <em>.decl</em> model file. Conformance is checked against the uploaded constraints.
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Select a mode, upload the required files, and click <em>Upload & Compute</em>. Once processing completes and deviations are detected, the <em>Next</em> button will become active.
            </Typography>
          </AccordionDetails>
        </Accordion>
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
              <ToggleButton value="upload">
                Upload .decl Model
              </ToggleButton>
              <ToggleButton value="mine">
                Mine Model from Log
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {declSubMode === 'mine'
                ? "A declarative model will be automatically mined from your event log using DECLARE templates."
                : "Upload a pre-existing .decl model and check your event log for conformance against it."}
            </Typography>
          </Paper>
        )}

        {/* Trace Alignment sub-mode selection */}
        {mode === 'bpmn' && (
          <Paper sx={{ p: 2, backgroundColor: '#f9f9f9' }}>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Process model source:
            </Typography>
            <ToggleButtonGroup
              value={bpmnSubMode}
              exclusive
              onChange={handleBpmnSubModeChange}
              fullWidth
              size="small"
            >
              <ToggleButton value="upload">Upload Process Model</ToggleButton>
              <ToggleButton value="mine">Mine Model from Log</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {bpmnSubMode === 'upload'
                ? "Upload a BPMN or PNML process model and an event log. Deviations are computed via trace alignment."
                : "A process model is automatically discovered from your event log using the selected algorithm, then used for trace alignment."}
            </Typography>
          </Paper>
        )}

        {/* BPMN upload sub-mode: model file */}
        {mode === 'bpmn' && bpmnSubMode === 'upload' && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">Upload Process Model</Typography>
            <TextField
              type="file"
              inputProps={{ accept: '.bpmn,.pnml' }}
              onChange={(e) => handleFileChange(e, setBpmnFile, setBpmnFileName)}
              fullWidth
            />
          </Paper>
        )}

        {/* BPMN mine sub-mode: algorithm selection */}
        {mode === 'bpmn' && bpmnSubMode === 'mine' && (
          <Paper sx={{ p: 3, textAlign: 'left' }}>
            <Typography variant="h6" gutterBottom>Discovery Algorithm</Typography>
            <ToggleButtonGroup
              value={miningAlgorithm}
              exclusive
              onChange={(_, v) => v && setMiningAlgorithm(v)}
              fullWidth
              size="small"
              sx={{ flexWrap: 'wrap' }}
            >
              <ToggleButton value="inductive_infrequent">Inductive Miner Infrequent</ToggleButton>
              <ToggleButton value="heuristics">Heuristics Miner</ToggleButton>
              <ToggleButton value="alpha">Alpha Miner</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {miningAlgorithm === 'inductive_infrequent' && "Inductive Miner Infrequent (IMf): filters infrequent behaviour below the noise threshold before discovery. Guarantees a sound, block-structured model."}
              {miningAlgorithm === 'heuristics' && "Heuristics Miner: dependency-graph-based discovery; more robust to noise. Does not guarantee soundness."}
              {miningAlgorithm === 'alpha' && "Alpha Miner: classic algorithm based on ordering relations. Sensitive to noise; does not handle loops or short-loops well."}
            </Typography>
            {(miningAlgorithm === 'inductive_infrequent') && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Noise threshold: <strong>{noiseThreshold.toFixed(2)}</strong>
                  <Tooltip title="Fraction of traces that can be filtered as infrequent behaviour. Higher = more filtering, simpler model." arrow>
                    <IconButton size="small" sx={{ ml: 0.5 }}><InfoIcon sx={{ fontSize: 14 }} /></IconButton>
                  </Tooltip>
                </Typography>
                <Slider
                  value={noiseThreshold}
                  onChange={(_, v) => setNoiseThreshold(v as number)}
                  min={0.0}
                  max={0.5}
                  step={0.05}
                  valueLabelDisplay="auto"
                  marks
                />
              </Box>
            )}
          </Paper>
        )}

        {/* Event log upload (all modes) */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Upload Event Log</Typography>
          <TextField
            type="file"
            inputProps={{ accept: '.xes,.csv,.xes.gz' }}
            onChange={(e) => handleFileChange(e, setXesFile, setXesFileName)}
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
              onChange={(e) => handleFileChange(e, setDeclFile, setDeclFileName)}
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

        {isReady && minedDeclFilename && (
          <Box sx={{ mt: 1, mb: 1 }}>
            <Button
              variant="outlined"
              size="small"
              component="a"
              href={`${API_URL}/api/download-mined-decl`}
              download={minedDeclFilename}
            >
              Download mined model as .decl
            </Button>
          </Box>
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
                ? (mode === 'bpmn' && bpmnSubMode === 'mine'
                    ? (miningPhase === 'computing' ? "Computing Alignments..." : "Mining Model...")
                    : mode === 'bpmn'
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
