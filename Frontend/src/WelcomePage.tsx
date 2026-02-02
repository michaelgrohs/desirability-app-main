import React, { useState } from 'react';
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

const WelcomePage: React.FC = () => {
  const [bpmnFile, setBpmnFile] = useState<File | null>(null);
  const [xesFile, setXesFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const navigate = useNavigate();

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

    setIsProcessing(true);

    const formData = new FormData();
    formData.append('bpmn', bpmnFile);
    formData.append('xes', xesFile);

    try {
      const response = await fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      console.log("Upload response:", data);

      if (response.ok) {
        setIsReady(true);
      } else {
        console.error("Upload failed:", data);
      }

    } catch (error) {
      console.error("Upload error:", error);
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
          <Typography variant="h6">Upload BPMN Model</Typography>
          <TextField
            type="file"
            inputProps={{ accept: '.bpmn' }}
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

        {!isReady ? (
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!bpmnFile || !xesFile || isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : <UploadFileIcon />}
          >
            {isProcessing ? "Computing Alignments..." : "Upload & Compute"}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            onClick={() => navigate('/overview')}
          >
            Next
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default WelcomePage;
