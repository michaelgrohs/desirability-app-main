import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { FileProvider } from "./FileContext";
import Layout from "./Layout";
import WelcomePage from "./WelcomePage";
import ViewBPMN from "./ViewBPMN";
import SelectDimensions from "./SelectDimensions";
import DeviationOverview from "./DeviationOverview";
import CausalResults from "./CausalResults";
import CriticalityResults from "./CriticalityResults";
import ViolationGuidelines from "./ViolationGuidelines";
import ActivityStats from "./ActivityStats";
import Recommendations from "./Recommendations";
import ModelReference from "./ModelReference";

const App: React.FC = () => {
  return (
    <FileProvider>
      <Router basename={process.env.PUBLIC_URL}>
        <Routes>
          {/* Standalone — no wizard chrome, meant to be opened in its own tab */}
          <Route path="/model-reference" element={<ModelReference />} />
          <Route element={<Layout />}>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/view-bpmn" element={<ViewBPMN />} />
            <Route path="/activity-stats" element={<ActivityStats />} />
            <Route path="/heatmap-aggr" element={<SelectDimensions />} />
            <Route path="/overview" element={<DeviationOverview />} />
            <Route path="/violation-guidelines" element={<ViolationGuidelines />} />
            <Route path="/select-dimensions" element={<SelectDimensions />} />
            <Route path="/causal-results" element={<CausalResults />} />
            <Route path="/criticality-results" element={<CriticalityResults />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </FileProvider>
  );
};

export default App;










