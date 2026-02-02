import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { FileProvider } from "./FileContext";
import WelcomePage from "./WelcomePage";
import ViewBPMN from "./ViewBPMN";
import SelectDimensions from "./SelectDimensions";
import DeviationOverview from "./DeviationOverview";
import ViolationGuidelines from "./ViolationGuidelines";
import ActivityStats from "./ActivityStats"; // Import the new ActivityStats page

const App: React.FC = () => {
  return (
    <FileProvider>
      <Router>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/view-bpmn" element={<ViewBPMN />} />
          <Route path="/activity-stats" element={<ActivityStats />} /> {/* Add this route */}
          <Route path="/heatmap-aggr" element={<SelectDimensions />} />
          <Route path="/overview" element={<DeviationOverview />} />
          <Route path="/violation-guidelines" element={<ViolationGuidelines />} />
            <Route path="/select-dimensions" element={<SelectDimensions />} />
        </Routes>
      </Router>
    </FileProvider>
  );
};

export default App;










