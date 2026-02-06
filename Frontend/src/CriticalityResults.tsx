import React from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
  Button,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CausalResult {
  deviation: string;
  dimension: string;
  ate: number;
  p_value: number;
}

type CriticalityLevel =
  | "very negative"
  | "negative"
  | "slightly negative"
  | "neutral"
  | "slightly positive"
  | "positive"
  | "very positive";

interface CriticalityRule {
  min: number;
  max: number;
  label: CriticalityLevel;
}

interface CriticalityMap {
  [dimension: string]: CriticalityRule[];
}

const getCriticality = (
  value: number,
  rules: CriticalityRule[] = []
): CriticalityLevel | null => {
  for (const rule of rules) {
    if (value >= rule.min && value < rule.max) return rule.label;
  }
  return null;
};

const getCriticalityColor = (label: CriticalityLevel | null) => {
  switch (label) {
    case "very positive":
      return "rgba(0,100,0,0.85)";
    case "positive":
      return "rgba(76,175,80,0.75)";
    case "slightly positive":
      return "rgba(129,199,132,0.7)";
    case "neutral":
      return "rgba(200,200,200,0.7)";
    case "slightly negative":
      return "rgba(255,183,77,0.75)";
    case "negative":
      return "rgba(255,152,0,0.75)";
    case "very negative":
      return "rgba(211,47,47,0.85)";
    default:
      return "#fff";
  }
};

const criticalityWeight = (label: CriticalityLevel | null) => {
  switch (label) {
    case "very negative":
      return 3;
    case "negative":
      return 2;
    case "slightly negative":
      return 1;
    case "neutral":
      return 0;
    case "slightly positive":
      return -1;
    case "positive":
      return -2;
    case "very positive":
      return -3;
    default:
      return 0;
  }
};

const CriticalityResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const results: CausalResult[] = location.state?.results || [];
  const criticalityMap: CriticalityMap = location.state?.criticalityMap || {};

  const dimensions = Array.from(new Set(results.map((r) => r.dimension)));
  const deviations = Array.from(new Set(results.map((r) => r.deviation)));

  const deviationPriorities = deviations
    .map((dev) => {
      let score = 0;
      let reasons: string[] = [];

      dimensions.forEach((dim) => {
        const result = results.find((r) => r.dimension === dim && r.deviation === dev);
        if (!result) return;

        const label = getCriticality(result.ate, criticalityMap[dim]);
        const weight = criticalityWeight(label);

        score += weight;
        if (weight > 0 && label) reasons.push(`${dim} is ${label}`);
      });

      return { deviation: dev, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const [priorityList, setPriorityList] = React.useState(deviationPriorities);

  const exportCSV = () => {
    let csv = "Dimension,Deviation,Criticality,ATE\n";

    dimensions.forEach((dim) => {
      deviations.forEach((dev) => {
        const result = results.find((r) => r.dimension === dim && r.deviation === dev);
        if (!result) return;

        const label = getCriticality(result.ate, criticalityMap[dim]);
        csv += `${dim},${dev},${label ?? ""},${result.ate}\n`;
      });
    });

    csv += "\n\nPriorities\n";
    csv += "Rank,Deviation,Score\n";

    priorityList.forEach((item, idx) => {
      csv += `${idx + 1},${item.deviation},${item.score}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "causal_results.csv";
    a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Criticality Overview", 14, 15);

    autoTable(doc, {
      startY: 20,
      head: [["Dimension", ...deviations]],
      body: dimensions.map((dim) => [
        dim,
        ...deviations.map((dev) => {
          const result = results.find((r) => r.dimension === dim && r.deviation === dev);
          if (!result) return "";
          const label = getCriticality(result.ate, criticalityMap[dim]);
          return `${label ?? "-"} (${result.ate.toFixed(2)})`;
        }),
      ]),
    });

    doc.addPage();
    doc.text("Prioritization", 14, 15);

    autoTable(doc, {
      startY: 20,
      head: [["Rank", "Deviation", "Score"]],
      body: priorityList.map((item, idx) => [idx + 1, item.deviation, item.score]),
    });

    doc.save("causal_analysis.pdf");
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setPriorityList((prev) => {
      const newList = [...prev];
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
      return newList;
    });
  };

  const moveDown = (index: number) => {
    if (index === priorityList.length - 1) return;
    setPriorityList((prev) => {
      const newList = [...prev];
      [newList[index + 1], newList[index]] = [newList[index], newList[index + 1]];
      return newList;
    });
  };

  const legendItems: { label: CriticalityLevel; color: string }[] = [
    { label: "very positive", color: getCriticalityColor("very positive") },
    { label: "positive", color: getCriticalityColor("positive") },
    { label: "slightly positive", color: getCriticalityColor("slightly positive") },
    { label: "neutral", color: getCriticalityColor("neutral") },
    { label: "slightly negative", color: getCriticalityColor("slightly negative") },
    { label: "negative", color: getCriticalityColor("negative") },
    { label: "very negative", color: getCriticalityColor("very negative") },
  ];

  return (
    <Box sx={{ width: "90vw", maxWidth: 1100, margin: "0 auto", mt: 4 }}>
      <Box display="flex" justifyContent="space-between" mb={4}>
        <Typography variant="h5">Criticality Overview</Typography>

        <Button variant="outlined" onClick={() => navigate("/")}>
          Back to Start
        </Button>
      </Box>

      <Box display="flex" gap={3} mb={3} alignItems="center" flexWrap="wrap">
        <Typography variant="subtitle2">Legend:</Typography>

        {legendItems.map((item) => (
          <Box key={item.label} display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 16,
                height: 16,
                backgroundColor: item.color,
                borderRadius: 1,
              }}
            />
            <Typography variant="caption">{item.label}</Typography>
          </Box>
        ))}
      </Box>

      <Button variant="outlined" onClick={exportCSV} sx={{ mt: 1 }}>
        Export as CSV
      </Button>
      <Button variant="contained" sx={{ ml: 2, mt: 1 }} onClick={exportPDF}>
        Export as PDF
      </Button>

      <Divider sx={{ my: 3 }} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>Dimension</strong>
            </TableCell>
            {deviations.map((dev) => (
              <TableCell key={dev} align="center">
                <strong>{dev}</strong>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {dimensions.map((dim) => (
            <TableRow key={dim}>
              <TableCell>
                <strong>{dim}</strong>
              </TableCell>

              {deviations.map((dev) => {
                const result = results.find((r) => r.dimension === dim && r.deviation === dev);
                if (!result) return <TableCell key={dev} />;

                const label = getCriticality(result.ate, criticalityMap[dim]);

                return (
                  <TableCell
                    key={dev}
                    align="center"
                    sx={{
                      backgroundColor: getCriticalityColor(label),
                      color: "white",
                      fontWeight: 500,
                    }}
                  >
                    {label ?? "-"} ({result.ate.toFixed(2)})
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Box mt={6}>
        <Typography variant="h6" gutterBottom>
          Suggested Prioritization
        </Typography>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Rank</TableCell>
              <TableCell>Deviation</TableCell>
              <TableCell>Priority Score</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Adjust</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {priorityList.map((item, index) => (
              <TableRow key={item.deviation}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{item.deviation}</TableCell>
                <TableCell>{item.score}</TableCell>
                <TableCell>
                  {item.reasons.length > 0 ? item.reasons.join(", ") : "No negative impact"}
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => moveUp(index)} disabled={index === 0}>
                    ↑
                  </Button>
                  <Button
                    size="small"
                    onClick={() => moveDown(index)}
                    disabled={index === priorityList.length - 1}
                    sx={{ ml: 1 }}
                  >
                    ↓
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
};

export default CriticalityResults;