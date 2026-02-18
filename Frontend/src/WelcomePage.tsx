import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  Paper,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useBottomNav } from './BottomNavContext';
import { useFileContext } from './FileContext';

const WelcomePage: React.FC = () => {
  const [bpmnFile, setBpmnFile] = useState<File | null>(null);
  const [xesFile, setXesFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const navigate = useNavigate();
  const { setContinue, setHideBack } = useBottomNav();
  const { resetAll } = useFileContext();

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

  const handleFileChange = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      setFile: React.Dispatch<React.SetStateAction<File | null>>
    ) => {
      const target = event.target as HTMLInputElement;

      if (target.files && target.files[0]) {
        setFile(target.files[0]);
      }
    };

  const handleUpload = async () => {
    if (!bpmnFile || !xesFile) return;

    resetAll();
    setIsProcessing(true);
    setIsReady(false);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('bpmn', bpmnFile);
    formData.append('xes', xesFile);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/upload`, {
          method: "POST",
          body: formData,
        });

      const data = await response.json();
      console.log("Upload response:", data);

      if (response.ok) {
        setIsReady(true);
      } else {
        const msg = data.error || "Upload failed";
        console.error("Upload failed:", msg);
        if (data.traceback) console.error("Backend traceback:\n", data.traceback);
        setErrorMsg(msg);
      }

    } catch (error) {
      console.error("Upload error:", error);
      setErrorMsg(String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', p: 4 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
        Conformance Analysis
      </Typography>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Upload Process Model</Typography>
          <TextField
            type="file"
            inputProps={{ accept: '.bpmn,.pnml' }}
            onChange={(e) => handleFileChange(e, setBpmnFile)}
            fullWidth
          />
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Upload Event Log</Typography>
          <TextField
            type="file"
            inputProps={{ accept: '.xes,.csv' }}
            onChange={(e) => handleFileChange(e, setXesFile)}
            fullWidth
          />
        </Paper>

        {errorMsg && (
          <Typography color="error" variant="body2">{errorMsg}</Typography>
        )}

        {!isReady && (
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!bpmnFile || !xesFile || isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : <UploadFileIcon />}
          >
            {isProcessing ? "Computing Alignments..." : "Upload & Compute"}
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default WelcomePage;
