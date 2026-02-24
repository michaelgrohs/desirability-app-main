import React from "react";
import { AppBar, Toolbar, Typography, Avatar, Box, Button, Container } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Outlet, useNavigate } from "react-router-dom";
import { BottomNavProvider, useBottomNav } from "./BottomNavContext";
import { useFileContext } from "./FileContext";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

const LayoutInner: React.FC = () => {
  const navigate = useNavigate();
  const { continueConfig, hideBack } = useBottomNav();
  const { resetAll } = useFileContext();

  const handleReset = async () => {
    try {
      await fetch(`${API_URL}/api/reset`, { method: "POST" });
    } catch (e) {
      console.warn("Failed to reset backend cache:", e);
    }
    resetAll();
    navigate("/");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top AppBar — sticky */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: "#fff",
          borderBottom: "1px solid #e0e0e0",
          zIndex: 1100,
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, color: "#333", fontWeight: 600 }}
          >
            Conformance Analysis
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            sx={{ mr: 2, color: "#757575", borderColor: "#bdbdbd" }}
          >
            Reset & Start Over
          </Button>
          <Avatar sx={{ bgcolor: "#e0e0e0" }}>
            <AccountCircleIcon sx={{ color: "#757575" }} />
          </Avatar>
        </Toolbar>
      </AppBar>

      {/* Content — scrollable */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box
            sx={{
              border: "1px solid #e0e0e0",
              borderRadius: 2,
              p: 3,
              backgroundColor: "#fff",
            }}
          >
            <Outlet />
          </Box>
        </Container>
      </Box>

      {/* Bottom Bar — sticky */}
      <Box
        sx={{
          backgroundColor: "#fff",
          borderTop: "1px solid #e0e0e0",
          px: 3,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {!hideBack ? (
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate(-1)}
            >
              Back
            </Button>
          ) : (
            <Box />
          )}

          {continueConfig ? (
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              disabled={continueConfig.disabled}
              onClick={continueConfig.onClick}
            >
              {continueConfig.label}
            </Button>
          ) : (
            <Box />
          )}
        </Container>
      </Box>
    </Box>
  );
};

const Layout: React.FC = () => {
  return (
    <BottomNavProvider>
      <LayoutInner />
    </BottomNavProvider>
  );
};

export default Layout;
