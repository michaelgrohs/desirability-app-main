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
  Tooltip,
  IconButton,
  CircularProgress,
  Chip,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useBottomNav } from "./BottomNavContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

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
  const { setContinue } = useBottomNav();

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
        if (!result || result.ate == null) return;

        const label = getCriticality(result.ate, criticalityMap[dim]);
        const weight = criticalityWeight(label);

        score += weight;
        if (weight > 0 && label) reasons.push(`${dim} is ${label}`);
      });

      return { deviation: dev, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const [priorityList, setPriorityList] = React.useState(deviationPriorities);

  React.useEffect(() => {
    setContinue({
      label: "Recommendations",
      onClick: () =>
        navigate("/recommendations", {
          state: { results, criticalityMap, priorityList },
        }),
    });
    return () => setContinue(null);
  }, [navigate, setContinue, results, criticalityMap, priorityList]);

  // Root cause analysis state
  const [selectedCell, setSelectedCell] = React.useState<{ dimension: string; deviation: string } | null>(null);
  const [matrixRows, setMatrixRows] = React.useState<any[]>([]);
  const [matrixCols, setMatrixCols] = React.useState<string[]>([]);
  const [matrixLoading, setMatrixLoading] = React.useState(false);
  const [correlCol, setCorrelCol] = React.useState<string | null>(null);

  React.useEffect(() => { setCorrelCol(null); }, [selectedCell]);

  const fetchMatrixIfNeeded = React.useCallback(async () => {
    if (matrixRows.length > 0) return;
    setMatrixLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/current-impact-matrix`);
      const data = await res.json();
      setMatrixRows(data.rows ?? []);
      setMatrixCols(data.columns ?? []);
    } catch (e) {
      console.error("Failed to fetch matrix:", e);
    } finally {
      setMatrixLoading(false);
    }
  }, [matrixRows.length]);

  const handleCellClick = (dimension: string, deviation: string) => {
    setSelectedCell(prev =>
      prev?.dimension === dimension && prev?.deviation === deviation ? null : { dimension, deviation }
    );
    fetchMatrixIfNeeded();
  };

  const exportCSV = () => {
    let csv = "Dimension,Deviation,Criticality,ATE\n";

    dimensions.forEach((dim) => {
      deviations.forEach((dev) => {
        const result = results.find((r) => r.dimension === dim && r.deviation === dev);
        if (!result || result.ate == null) return;

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
    doc.text("Criticality Results", 14, 15);

    autoTable(doc, {
      startY: 20,
      head: [["Dimension", ...deviations]],
      body: dimensions.map((dim) => [
        dim,
        ...deviations.map((dev) => {
          const result = results.find((r) => r.dimension === dim && r.deviation === dev);
          if (!result) return "";
          const label = getCriticality(result.ate, criticalityMap[dim]);
          return `${label ?? "-"} (${result.ate != null ? result.ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"})`;
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

  // ---------------------------
  // Root cause helpers
  // ---------------------------
  const BINARY_DIM_NAMES = new Set(["outcome", "quality", "compliance"]);
  const DIM_NAMES_SET = new Set(["time", "costs", "quality", "outcome", "compliance"]);

  const computeBins = (values: number[], numBins = 12): { label: string; count: number }[] => {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [{ label: min.toLocaleString("en-US", { maximumFractionDigits: 2 }), count: values.length }];
    const binSize = (max - min) / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
      label: (min + i * binSize).toLocaleString("en-US", { maximumFractionDigits: 1 }),
      count: 0,
    }));
    values.forEach(v => {
      const idx = Math.min(Math.floor((v - min) / binSize), numBins - 1);
      bins[idx].count++;
    });
    return bins;
  };

  const pearsonCorr = (xs: number[], ys: number[]): number | null => {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
    return den === 0 ? null : num / den;
  };

  const renderActivityChevrons = (acts: string[]) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 0" }}>
      {acts.map((act, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <Box component="span" sx={{ mx: 0.5, color: "#bbb", fontSize: "10px" }}>›</Box>}
          <Box component="span" sx={{
            display: "inline-block", background: "#e3f2fd", color: "#1565c0",
            borderRadius: "3px", px: "4px", py: "1px", fontSize: "10px",
            whiteSpace: "nowrap", lineHeight: 1.5,
          }}>{act}</Box>
        </React.Fragment>
      ))}
    </Box>
  );

  const renderCellValue = (val: any) => {
    if (Array.isArray(val)) return renderActivityChevrons(val as string[]);
    if (typeof val === "number") return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return val ?? "–";
  };

  const isColNumerical = (col: string) =>
    matrixRows.some(row => typeof row[col] === "number");

  const isColBinary = (col: string) => {
    const vals = matrixRows.map(r => r[col]).filter(v => v !== null && v !== undefined);
    return vals.length > 0 && vals.every(v => v === 0 || v === 1);
  };

  const renderRootCause = () => {
    if (!selectedCell) return null;
    const { dimension, deviation } = selectedCell;
    const isBinaryDim = BINARY_DIM_NAMES.has(dimension.toLowerCase());

    // Identify all deviation columns in the matrix (binary 0/1, not a known dimension)
    const orderedCols = matrixCols.length > 0 ? matrixCols : (matrixRows.length > 0 ? Object.keys(matrixRows[0]) : []);
    const allDevCols = new Set(orderedCols.filter(col => {
      if (DIM_NAMES_SET.has(col)) return false;
      const vals = matrixRows.map(r => r[col]).filter(v => v !== null && v !== undefined);
      return vals.length > 0 && vals.every(v => v === 0 || v === 1);
    }));

    // Show all columns except OTHER deviation indicators (keep the selected deviation)
    const traceTableCols = orderedCols.filter(col => !allDevCols.has(col) || col === deviation);

    // Columns clickable for correlation: numerical, not the dimension itself, not the deviation
    const canCorrel = (col: string) =>
      col !== dimension && col !== deviation && !Array.isArray(matrixRows[0]?.[col]) && isColNumerical(col);

    const dimValues = matrixRows.map(r => r[dimension]).filter((v): v is number => typeof v === "number");
    const devValues = matrixRows.map(r => r[deviation]).filter(v => v === 0 || v === 1);

    const sortedRows = [...matrixRows]
      .filter(row => typeof row[dimension] === "number")
      .sort((a, b) => a[dimension] - b[dimension]);
    const bottomFive = sortedRows.slice(0, 5);
    const topFive = sortedRows.slice(-5).reverse();

    // Dimension distribution chart
    const dimChart = isBinaryDim ? (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={[
          { label: "0 (negative)", count: dimValues.filter(v => v === 0).length },
          { label: "1 (positive)", count: dimValues.filter(v => v === 1).length },
        ]} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 9 }} width={28} />
          <RechartsTip formatter={(v: any) => [v, "traces"]} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            <Cell fill="#ef5350" /><Cell fill="#66bb6a" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={computeBins(dimValues)} margin={{ top: 4, right: 8, left: 0, bottom: 38 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 9 }} width={28} />
          <RechartsTip formatter={(v: any) => [v, "traces"]} />
          <Bar dataKey="count" fill="#1976d2" opacity={0.75} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );

    // Correlation charts
    const renderCorrelation = () => {
      if (!correlCol) return null;
      const isArray = Array.isArray(matrixRows[0]?.[correlCol]);
      if (isArray) return (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Correlation not available for activity sequence columns.
        </Typography>
      );

      const correlNumerical = isColNumerical(correlCol);
      if (!correlNumerical) return null;

      // correlCol vs deviation (binary)
      const g0 = matrixRows.filter(r => r[deviation] === 0 && typeof r[correlCol] === "number");
      const g1 = matrixRows.filter(r => r[deviation] === 1 && typeof r[correlCol] === "number");
      const mean0dev = g0.length ? g0.reduce((s, r) => s + r[correlCol], 0) / g0.length : 0;
      const mean1dev = g1.length ? g1.reduce((s, r) => s + r[correlCol], 0) / g1.length : 0;
      const devBars = [
        { label: "No deviation (0)", mean: mean0dev },
        { label: "Deviation (1)", mean: mean1dev },
      ];

      // correlCol vs dimension
      const pairsForDim = matrixRows.filter(r =>
        typeof r[correlCol] === "number" && typeof r[dimension] === "number"
      );
      const r = pearsonCorr(
        pairsForDim.map(r => r[correlCol]),
        pairsForDim.map(r => r[dimension])
      );

      let dimCorrelChart: React.ReactNode;
      if (isBinaryDim) {
        const dg0 = matrixRows.filter(r => r[dimension] === 0 && typeof r[correlCol] === "number");
        const dg1 = matrixRows.filter(r => r[dimension] === 1 && typeof r[correlCol] === "number");
        const dmean0 = dg0.length ? dg0.reduce((s, r) => s + r[correlCol], 0) / dg0.length : 0;
        const dmean1 = dg1.length ? dg1.reduce((s, r) => s + r[correlCol], 0) / dg1.length : 0;
        dimCorrelChart = (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{ label: `${dimension}=0`, mean: dmean0 }, { label: `${dimension}=1`, mean: dmean1 }]}
              margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} width={40} />
              <RechartsTip formatter={(v: any) => [v.toFixed(3), `Mean ${correlCol}`]} />
              <Bar dataKey="mean" radius={[2, 2, 0, 0]}>
                <Cell fill="#ef5350" /><Cell fill="#66bb6a" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      } else {
        // Scatter plot — sample up to 500 points for performance
        const sample = pairsForDim.slice(0, 500).map(row => ({ x: row[correlCol], y: row[dimension] }));
        dimCorrelChart = (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" type="number" name={correlCol} tick={{ fontSize: 9 }}
                  label={{ value: correlCol, position: "insideBottom", offset: -12, fontSize: 9 }} />
                <YAxis dataKey="y" type="number" name={dimension} tick={{ fontSize: 9 }} width={40} />
                <ZAxis range={[18, 18]} />
                <RechartsTip cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v: any, n: string) => [v.toLocaleString("en-US", { maximumFractionDigits: 2 }), n]} />
                <Scatter data={sample} fill="#1976d2" opacity={0.45} />
              </ScatterChart>
            </ResponsiveContainer>
            {pairsForDim.length > 500 && (
              <Typography variant="caption" color="text.secondary">
                Showing 500 of {pairsForDim.length} traces for readability.
              </Typography>
            )}
          </>
        );
      }

      return (
        <Box sx={{ mt: 2, p: 2, border: "1px solid #e0e0e0", borderRadius: 1, backgroundColor: "#f9f9f9" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2">
              Correlation: <strong>{correlCol}</strong> vs deviation and dimension
              {r !== null && (
                <Box component="span" sx={{ ml: 1, color: Math.abs(r) > 0.5 ? "#c62828" : Math.abs(r) > 0.2 ? "#e65100" : "#555", fontSize: 12 }}>
                  (Pearson r = {r.toFixed(3)} with {dimension})
                </Box>
              )}
            </Typography>
            <IconButton size="small" onClick={() => setCorrelCol(null)}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <Box display="flex" gap={3} flexWrap="wrap">
            <Box sx={{ flex: "1 1 220px", minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Mean <strong>{correlCol}</strong> by <strong>{deviation}</strong>
              </Typography>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={devBars} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={40} />
                  <RechartsTip formatter={(v: any) => [v.toFixed(3), `Mean ${correlCol}`]} />
                  <Bar dataKey="mean" radius={[2, 2, 0, 0]}>
                    <Cell fill="#78909c" /><Cell fill="#ef5350" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ flex: "1 1 220px", minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                <strong>{correlCol}</strong> vs <strong>{dimension}</strong>
                {isBinaryDim ? " (mean by group)" : " (scatter)"}
              </Typography>
              {dimCorrelChart}
            </Box>
          </Box>
        </Box>
      );
    };

    // Trace table renderer
    const TraceTable = ({ label, rows, headerColor }: { label: string; rows: any[]; headerColor: string }) => (
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" gutterBottom>{label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          Click any column header to explore its correlation with the dimension and deviation.
        </Typography>
        <Box sx={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 1 }}>
          <Table size="small" sx={{ minWidth: 500 }}>
            <TableHead>
              <TableRow>
                {traceTableCols.map(col => {
                  const clickable = canCorrel(col);
                  const active = correlCol === col;
                  return (
                    <TableCell
                      key={col}
                      onClick={clickable ? () => setCorrelCol(active ? null : col) : undefined}
                      sx={{
                        fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                        backgroundColor: active ? "#e3f2fd" : headerColor,
                        cursor: clickable ? "pointer" : "default",
                        userSelect: "none",
                        "&:hover": clickable ? { backgroundColor: "#bbdefb" } : {},
                        borderBottom: active ? "2px solid #1976d2" : undefined,
                      }}
                    >
                      {col === "trace_duration_seconds" ? "Duration (s)" : col}
                      {active && <Box component="span" sx={{ ml: 0.5, color: "#1976d2" }}>↑</Box>}
                      {clickable && !active && <Box component="span" sx={{ ml: 0.5, color: "#bbb", fontSize: 9 }}>~</Box>}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={idx} sx={{ "&:last-child td": { borderBottom: 0 }, "&:nth-of-type(even)": { backgroundColor: "#fafafa" } }}>
                  {traceTableCols.map(col => (
                    <TableCell key={col} sx={{ fontSize: 10, verticalAlign: "middle" }}>
                      {col === deviation
                        ? (row[col] === 1 ? <Box component="span" sx={{ color: "#c62828", fontWeight: 700 }}>✓</Box> : "–")
                        : renderCellValue(row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    );

    return (
      <Box sx={{ border: "1px solid #e0e0e0", borderRadius: 2, p: 3, mb: 4, backgroundColor: "#fafafa" }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6" sx={{ mb: 0.5 }}>Root Cause View</Typography>
            <Box display="flex" gap={1}>
              <Chip label={`Dimension: ${dimension}`} size="small" color="primary" variant="outlined" />
              <Chip label={`Deviation: ${deviation}`} size="small" color="warning" variant="outlined" />
              <Chip label={`${matrixRows.length} traces`} size="small" variant="outlined" />
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setSelectedCell(null)}><CloseIcon fontSize="small" /></IconButton>
        </Box>

        {matrixLoading && <CircularProgress size={24} sx={{ display: "block", mx: "auto", my: 2 }} />}

        {!matrixLoading && (
          <>
            {/* Distribution charts */}
            <Box display="flex" gap={4} flexWrap="wrap" mb={2}>
              <Box sx={{ flex: "1 1 280px", minWidth: 240 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Distribution of <em>{dimension}</em>{isBinaryDim ? " (binary)" : ` — ${dimValues.length} values`}
                </Typography>
                {dimChart}
              </Box>
              <Box sx={{ flex: "0 1 200px", minWidth: 160 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Distribution of <em>{deviation}</em>
                </Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={[
                    { label: "0 — no deviation", count: devValues.filter(v => v === 0).length },
                    { label: "1 — deviation", count: devValues.filter(v => v === 1).length },
                  ]} margin={{ top: 4, right: 8, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} width={28} />
                    <RechartsTip formatter={(v: any) => [v, "traces"]} />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      <Cell fill="#78909c" /><Cell fill="#ef5350" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>

            {/* Correlation panel */}
            {renderCorrelation()}

            <Divider sx={{ my: 3 }} />

            {/* Trace tables — stacked vertically */}
            <TraceTable
              label={`5 Traces with Lowest ${dimension}`}
              rows={bottomFive}
              headerColor="#e3f2fd"
            />
            <TraceTable
              label={`5 Traces with Highest ${dimension}`}
              rows={topFive}
              headerColor="#fce4ec"
            />
          </>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ width: "100%", margin: "0 auto", mt: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box display="flex" alignItems="center">
          <Typography variant="h5">Criticality Overview</Typography>
          <Tooltip
            title="Each cell shows the criticality label (e.g., 'very negative', 'neutral') assigned to the CATE of a deviation for a given dimension, based on the thresholds you configured on the previous page. The priority table ranks deviations by their overall negative impact across all dimensions — use the arrows to adjust the order manually. Export as CSV or PDF to share results."
            arrow
            placement="right"
          >
            <IconButton size="small" sx={{ ml: 1 }}>
              <InfoIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        </Box>
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

                const isSelected = selectedCell?.dimension === dim && selectedCell?.deviation === dev;
                return (
                  <TableCell
                    key={dev}
                    align="center"
                    onClick={() => handleCellClick(dim, dev)}
                    sx={{
                      backgroundColor: getCriticalityColor(label),
                      color: "white",
                      fontWeight: 500,
                      cursor: "pointer",
                      outline: isSelected ? "3px solid #333" : "none",
                      outlineOffset: "-3px",
                      userSelect: "none",
                      "&:hover": { opacity: 0.85 },
                    }}
                  >
                    {label ?? "-"} ({result.ate != null ? result.ate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"})
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedCell && (
        <Box mt={4}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Click a cell in the table above to inspect it. Click the same cell again or the × to close.
          </Typography>
          {renderRootCause()}
        </Box>
      )}

      {!selectedCell && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3, mb: 1 }}>
          Click any colored cell to open root cause analysis for that dimension × deviation.
        </Typography>
      )}

      <Box mt={selectedCell ? 2 : 4}>
        <Box display="flex" alignItems="center" mb={1}>
          <Typography variant="h6">Suggested Prioritization</Typography>
          <Tooltip
            title={
              "Each deviation receives a priority score based on how negative its CATE labels are across all dimensions. " +
              "Scores per dimension: 'very negative' = +3, 'negative' = +2, 'slightly negative' = +1, 'neutral' = 0, " +
              "'slightly positive' = −1, 'positive' = −2, 'very positive' = −3. " +
              "These per-dimension scores are summed into a total priority score — a higher score means a more negative overall impact across all dimensions, and therefore higher remediation priority. " +
              "You can manually reorder deviations using the arrow buttons."
            }
            arrow
            placement="right"
          >
            <IconButton size="small" sx={{ ml: 1 }}>
              <InfoIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        </Box>

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
                <TableCell>{item.score.toLocaleString('en-US')}</TableCell>
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