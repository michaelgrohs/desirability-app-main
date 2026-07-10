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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { useLocation, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useBottomNav } from "./BottomNavContext";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

interface CausalResult {
  deviation: string;
  dimension: string;
  ate: number;
  p_value: number | null;
  method?: string;
  total_cost?: number;
  mean_cost_violated?: number;
  n_traces_with_cost?: number;
  n_traces?: number;
  n_treated?: number;
  n_violations?: number;
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

// Returns the parenthetical value string shown next to the criticality label
const resultValueLabel = (r: CausalResult): string => {
  const pStr = r.p_value != null ? `, p=${r.p_value.toFixed(3)}` : "";
  if (r.method === "direct_time_cost") {
    if (r.total_cost != null) {
      return `total cost: ${r.total_cost.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${pStr}`;
    }
    return "—";
  }
  return r.ate != null
    ? `${r.ate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${pStr}`
    : "–";
};

const capDim = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type PriorityBucket = "negative" | "neutral" | "positive";
const bucketOf = (baseScore: number): PriorityBucket =>
  baseScore > 0 ? "negative" : baseScore < 0 ? "positive" : "neutral";

const SIGNIFICANCE_THRESHOLD = 0.05;
const isSignificant = (p: number | null | undefined): boolean => p != null && p < SIGNIFICANCE_THRESHOLD;

// Orange "n.s." badge appended wherever a p-value doesn't clear significance —
// same styling used on the Causal Effects and Recommendations screens, so the
// signal reads consistently everywhere it appears.
const InsignificantFlag: React.FC<{ p: number | null | undefined }> = ({ p }) => {
  if (isSignificant(p)) return null;
  return (
    <Tooltip
      title={`Not statistically significant (${p != null ? `p = ${p.toFixed(3)}` : "p unavailable"}, ≥ ${SIGNIFICANCE_THRESHOLD}) — interpret this effect with caution.`}
      arrow
    >
      <Box
        component="span"
        sx={{
          display: "inline-block",
          ml: 0.5,
          px: 0.6,
          py: "1px",
          borderRadius: "4px",
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "#e65100",
          backgroundColor: "rgba(255,152,0,0.28)",
          border: "1px solid rgba(230,81,0,0.6)",
          cursor: "help",
          whiteSpace: "nowrap",
        }}
      >
        ⚠ n.s.
      </Box>
    </Tooltip>
  );
};

const CriticalityResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setContinue } = useBottomNav();

  const results: CausalResult[] = location.state?.results || [];
  const criticalityMap: CriticalityMap = location.state?.criticalityMap || {};

  const dimensions = Array.from(new Set(results.map((r) => r.dimension)));
  const deviations = Array.from(new Set(results.map((r) => r.deviation)));

  const deviationFrequency: { [dev: string]: number | undefined } = {};
  deviations.forEach((dev) => {
    const r = results.find((r) => r.deviation === dev);
    if (!r) return;
    if (r.method === "direct_time_cost") {
      deviationFrequency[dev] = r.n_violations;
    } else {
      deviationFrequency[dev] = r.n_treated;
    }
  });

  // Base priority score: purely derived from the causal criticality labels — this is
  // what determines whether a deviation is objectively harmful/beneficial/neutral, and
  // is NOT affected by manual adjustments (those only re-rank urgency within a bucket).
  const priorityBase = React.useMemo(
    () =>
      deviations.map((dev) => {
        let score = 0;
        // Kept as plain strings — this feeds PriorityItem.reasons on the Recommendations
        // screen (PDF export + "Key impacts" line), which expects string[]. The Criticality
        // screen itself shows the full per-dimension effect + p-value breakdown separately.
        const reasons: string[] = [];

        dimensions.forEach((dim) => {
          const result = results.find((r) => r.dimension === dim && r.deviation === dev);
          if (!result || result.ate == null) return;

          const label = getCriticality(result.ate, criticalityMap[dim]);
          const weight = criticalityWeight(label);

          score += weight;
          // Capture every non-neutral dimension as a reason — not just harmful ones —
          // so beneficial/neutral-bucket deviations also show what's driving their score.
          if (weight !== 0 && label) reasons.push(`${capDim(dim)} is ${label}`);
        });

        return { deviation: dev, baseScore: score, reasons, frequency: deviationFrequency[dev] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deviations, dimensions, results, criticalityMap]
  );

  // Manual "priority points" a user can add/remove per deviation, on top of the base
  // score. Lets people fold in signals the causal score doesn't capture (see the
  // "Other ways to prioritize" tip below) without touching the underlying analysis.
  //
  // Adjustments are staged as a draft (+/- stepper) and only take effect — re-sorting
  // the list and potentially moving the card to a different column — once "Confirm"
  // is clicked. This avoids the list reshuffling under the user mid-click.
  const [committedAdjustments, setCommittedAdjustments] = React.useState<{ [dev: string]: number }>({});
  const [draftAdjustments, setDraftAdjustments] = React.useState<{ [dev: string]: number }>({});

  const bumpDraft = (dev: string, delta: number) => {
    setDraftAdjustments((prev) => {
      const current = prev[dev] !== undefined ? prev[dev] : committedAdjustments[dev] || 0;
      return { ...prev, [dev]: current + delta };
    });
  };

  const confirmAdjustment = (dev: string) => {
    const pending = draftAdjustments[dev];
    if (pending === undefined) return;
    setCommittedAdjustments((prev) => ({ ...prev, [dev]: pending }));
    setDraftAdjustments((prev) => {
      const next = { ...prev };
      delete next[dev];
      return next;
    });
  };

  const resetAdjustment = (dev: string) => {
    setCommittedAdjustments((prev) => {
      const next = { ...prev };
      delete next[dev];
      return next;
    });
    setDraftAdjustments((prev) => {
      const next = { ...prev };
      delete next[dev];
      return next;
    });
  };

  // Final ranking: base score + COMMITTED manual adjustment (pending/draft edits don't
  // affect ordering until confirmed), with frequency as a tiebreaker so that among
  // deviations landing on the same priority score, the more frequent one ranks first
  // (it represents more total impact even at the same severity).
  const priorityList = React.useMemo(
    () =>
      priorityBase
        .map((p) => {
          const adjustment = committedAdjustments[p.deviation] || 0;
          const draftAdjustment = draftAdjustments[p.deviation] !== undefined ? draftAdjustments[p.deviation] : adjustment;
          return {
            ...p,
            adjustment,
            score: p.baseScore + adjustment,
            draftAdjustment,
            hasPendingChange: draftAdjustment !== adjustment,
          };
        })
        .sort((a, b) => b.score - a.score || (b.frequency ?? 0) - (a.frequency ?? 0)),
    [priorityBase, committedAdjustments, draftAdjustments]
  );

  // Buckets use the FINAL (base + confirmed adjustment) score, so a large enough
  // manual adjustment can move a deviation into a different column once confirmed.
  const buckets = React.useMemo(() => {
    const b: { [K in PriorityBucket]: typeof priorityList } = { negative: [], neutral: [], positive: [] };
    priorityList.forEach((item) => b[bucketOf(item.score)].push(item));
    return b;
  }, [priorityList]);

  const [collapsedBuckets, setCollapsedBuckets] = React.useState<{ [K in PriorityBucket]: boolean }>({
    negative: false,
    neutral: false,
    positive: false,
  });

  React.useEffect(() => {
    setContinue({
      label: "Root Cause Investigation",
      onClick: () =>
        navigate("/recommendations", {
          state: { results, criticalityMap, priorityList },
        }),
    });
    return () => setContinue(null);
  }, [navigate, setContinue, results, criticalityMap, priorityList]);

  const exportCSV = () => {
    let csv = "Dimension,Deviation,Criticality,Value\n";

    dimensions.forEach((dim) => {
      deviations.forEach((dev) => {
        const result = results.find((r) => r.dimension === dim && r.deviation === dev);
        if (!result || result.ate == null) return;

        const label = getCriticality(result.ate, criticalityMap[dim]);
        const val = result.method === "direct_time_cost" ? (result.total_cost ?? "") : result.ate;
        csv += `${capDim(dim)},${dev},${label ?? ""},${val}\n`;
      });
    });

    csv += "\n\nPriorities\n";
    csv += "Rank,Deviation,Frequency,Base Score,Adjustment,Final Score\n";

    priorityList.forEach((item, idx) => {
      csv += `${idx + 1},${item.deviation},${item.frequency ?? ""},${item.baseScore},${item.adjustment},${item.score}\n`;
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
        capDim(dim),
        ...deviations.map((dev) => {
          const result = results.find((r) => r.dimension === dim && r.deviation === dev);
          if (!result) return "";
          const label = getCriticality(result.ate, criticalityMap[dim]);
          return `${label ?? "-"} (${resultValueLabel(result)})`;
        }),
      ]),
    });

    doc.addPage();
    doc.text("Prioritization", 14, 15);

    autoTable(doc, {
      startY: 20,
      head: [["Rank", "Deviation", "Frequency", "Base Score", "Adjustment", "Final Score"]],
      body: priorityList.map((item, idx) => [
        idx + 1,
        item.deviation,
        item.frequency ?? "—",
        item.baseScore,
        item.adjustment,
        item.score,
      ]),
    });

    doc.save("causal_analysis.pdf");
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
    <Box sx={{ width: "100%", margin: "0 auto", mt: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center">
          <Typography variant="h5">Criticality Overview</Typography>
          <Tooltip
            title="Each cell shows the criticality label (e.g., 'very negative', 'neutral') assigned to the ATE of a deviation for a given dimension, based on the thresholds you configured on the previous page. The priority table ranks deviations by their overall negative impact across all dimensions — use the arrows to adjust the order manually. Export as CSV or PDF to share results. Click 'Root Cause Investigation' to proceed to detailed root cause analysis."
            arrow
            placement="right"
          >
            <IconButton size="small" sx={{ ml: 1 }}>
              <InfoIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What you see</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              A criticality matrix that translates each ATE value into a qualitative label (e.g., "very negative", "neutral", "positive") based on the thresholds you set. Below the matrix, deviations are ranked by their overall negative impact across all dimensions.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={true} disableGutters sx={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: '8px !important', boxShadow: 'none', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>What to do</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Review the criticality labels and the suggested prioritization. Adjust the ranking manually if needed using the arrow buttons. When satisfied, click <em>Root Cause Investigation</em> to explore the underlying causes of each deviation.
            </Typography>
          </AccordionDetails>
        </Accordion>
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
        <Box display="flex" alignItems="center" gap={1}>
          <InsignificantFlag p={1} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: -0.5 }}>= not statistically significant (p ≥ {SIGNIFICANCE_THRESHOLD}) — interpret with caution</Typography>
        </Box>
      </Box>

      <Button variant="outlined" onClick={exportCSV} sx={{ mt: 1 }}>
        Export as CSV
      </Button>
      <Button variant="contained" sx={{ ml: 2, mt: 1 }} onClick={exportPDF}>
        Export as PDF
      </Button>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Table size="small" sx={{ minWidth: Math.max(400, deviations.length * 140 + 160) }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 3, background: '#f5f5f5', fontWeight: 700, minWidth: 160, borderRight: '2px solid', borderColor: 'divider' }}>
              <strong>Dimension</strong>
            </TableCell>
            {deviations.map((dev) => (
              <TableCell key={dev} align="center" sx={{ minWidth: 140, maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <strong>{dev}</strong>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          <TableRow>
            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, background: '#f0f4f8', borderRight: '2px solid', borderColor: 'divider', fontWeight: 700, color: 'text.secondary' }}>
              Frequency
            </TableCell>
            {deviations.map((dev) => {
              const freq = deviationFrequency[dev];
              return (
                <TableCell key={dev} align="center" sx={{ background: '#f0f4f8', fontWeight: 600, color: 'text.secondary' }}>
                  {freq != null ? freq.toLocaleString('en-US') : "—"}
                </TableCell>
              );
            })}
          </TableRow>
          {dimensions.map((dim) => (
            <TableRow key={dim}>
              <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, background: '#fafafa', borderRight: '2px solid', borderColor: 'divider' }}>
                <strong>{capDim(dim)}</strong>
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
                    {label ?? "-"} ({resultValueLabel(result)})
                    <InsignificantFlag p={result.p_value} />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Proceed to Root Cause Investigation to explore root cause analysis for each deviation.
      </Typography>

      <Box mt={4}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} flexWrap="wrap" gap={1}>
          <Box display="flex" alignItems="center">
            <Typography variant="h6">Suggested Prioritization</Typography>
            <Tooltip
              title={
                "Each deviation gets a base score from how negative its ATE labels are across all dimensions " +
                "('very negative' = +3 … 'very positive' = −3, summed). Positive final score (base + confirmed " +
                "adjustment) = Negative impact (harmful, needs remediation), negative final score = Positive " +
                "impact (beneficial, worth keeping), zero = Neutral — confirming a manual adjustment large enough " +
                "to cross zero moves the deviation to a different column. " +
                "Within a column, deviations are ranked by final score; ties are broken by frequency (the " +
                "deviation occurring more often is ranked first, since it represents more total impact). " +
                "Adjustments made with the +/- stepper are staged as a draft until you click Confirm."
              }
              arrow
              placement="right"
            >
              <IconButton size="small" sx={{ ml: 1 }}>
                <InfoIcon fontSize="small" color="action" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box display="flex" gap={1}>
            <Button size="small" onClick={() => setCollapsedBuckets({ negative: false, neutral: false, positive: false })}>
              Expand all
            </Button>
            <Button size="small" onClick={() => setCollapsedBuckets({ negative: true, neutral: true, positive: true })}>
              Collapse all
            </Button>
          </Box>
        </Box>

        <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important', mb: 2, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={500}>Other ways to prioritize (beyond frequency)</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Frequency is one useful signal, but not the only one. Depending on your context, you may also want to weigh:
            </Typography>
            <Box component="ul" sx={{ pl: 2, mt: 0, mb: 0 }}>
              <Box component="li"><Typography variant="body2" color="text.secondary">Statistical significance — deviations flagged <strong>⚠ n.s.</strong> above carry more uncertainty and may deserve lower priority (or a "collect more data" flag) until confirmed.</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Raw effect size within a category — two "very negative" deviations aren't equally bad if one's ATE is −0.9 and the other's is −0.31.</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Monetary cost — for cost-related dimensions, the total cost impact is a more concrete driver than the qualitative label alone.</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Remediation effort — an impact/effort view (e.g. tag each deviation Low/Medium/High effort) surfaces "quick wins": high impact, low effort.</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Compliance/strategic criticality — some deviations may warrant a fixed priority boost regardless of computed score (e.g. regulatory exposure).</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Trend over time — a deviation becoming more frequent recently is more urgent than one that's stable or declining.</Typography></Box>
              <Box component="li"><Typography variant="body2" color="text.secondary">Co-occurrence with other high-priority deviations — a deviation that frequently accompanies other harmful ones may be an upstream root cause rather than a symptom.</Typography></Box>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              The manual adjustment below is intentionally generic — use it to fold in whichever of these matters most for your process.
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Box display="flex" gap={2} alignItems="flex-start" flexWrap="wrap">
          {([
            { key: "negative" as const, title: "Negative impact", subtitle: "Harmful — needs remediation", color: "rgba(211,47,47,0.9)" },
            { key: "neutral" as const, title: "Neutral impact", subtitle: "No meaningful net effect", color: "rgba(120,120,120,0.9)" },
            { key: "positive" as const, title: "Positive impact", subtitle: "Beneficial — consider keeping", color: "rgba(46,125,50,0.9)" },
          ]).map(({ key, title, subtitle, color }) => {
            const items = buckets[key];
            const collapsed = collapsedBuckets[key];
            return (
              <Box key={key} sx={{ flex: "1 1 300px", minWidth: 280, border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                <Box
                  onClick={() => setCollapsedBuckets((prev) => ({ ...prev, [key]: !prev[key] }))}
                  sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.25, backgroundColor: color, color: "#fff", cursor: "pointer", userSelect: "none" }}
                >
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.9 }}>{subtitle} · {items.length} deviation{items.length === 1 ? "" : "s"}</Typography>
                  </Box>
                  <IconButton size="small" sx={{ color: "#fff" }}>
                    <ExpandMoreIcon sx={{ transform: collapsed ? "none" : "rotate(180deg)", transition: "transform 0.2s" }} />
                  </IconButton>
                </Box>

                {!collapsed && (
                  <Box sx={{ p: 1.25, display: "flex", flexDirection: "column", gap: 1, maxHeight: 620, overflowY: "auto" }}>
                    {items.length === 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                        No deviations in this category.
                      </Typography>
                    )}
                    {items.map((item, idx) => (
                      <Box key={item.deviation} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          #{idx + 1} {item.deviation}
                        </Typography>

                        <Box display="flex" gap={2} mt={0.5} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            Frequency: <strong>{item.frequency != null ? item.frequency.toLocaleString("en-US") : "—"}</strong>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Score: <strong>{item.baseScore}</strong>
                            {item.adjustment !== 0 && (
                              <> {item.adjustment > 0 ? "+" : ""}{item.adjustment} = <strong>{item.score}</strong></>
                            )}
                          </Typography>
                        </Box>

                        <Box sx={{ mt: 0.75, display: "flex", flexDirection: "column", gap: 0.25 }}>
                          {dimensions.map((dim) => {
                            const result = results.find((r) => r.dimension === dim && r.deviation === item.deviation);
                            if (!result || result.ate == null) return null;
                            const label = getCriticality(result.ate, criticalityMap[dim]);
                            return (
                              <Typography key={dim} variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                <Box
                                  component="span"
                                  sx={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: getCriticalityColor(label), mr: 0.75, verticalAlign: "middle" }}
                                />
                                {capDim(dim)}: {label ?? "-"} ({resultValueLabel(result)})
                                <InsignificantFlag p={result.p_value} />
                              </Typography>
                            );
                          })}
                        </Box>

                        <Box display="flex" alignItems="center" gap={0.25} mt={1} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                            Adjust:
                          </Typography>
                          <IconButton size="small" onClick={() => bumpDraft(item.deviation, -1)}>
                            <RemoveIcon fontSize="inherit" />
                          </IconButton>
                          <Typography
                            variant="caption"
                            sx={{ minWidth: 18, textAlign: "center", fontWeight: item.hasPendingChange ? 700 : 400, color: item.hasPendingChange ? "warning.main" : "inherit" }}
                          >
                            {item.draftAdjustment}
                          </Typography>
                          <IconButton size="small" onClick={() => bumpDraft(item.deviation, 1)}>
                            <AddIcon fontSize="inherit" />
                          </IconButton>
                          {item.hasPendingChange && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => confirmAdjustment(item.deviation)}
                              sx={{ ml: 1, fontSize: "0.65rem", py: 0, minWidth: 0 }}
                            >
                              Confirm
                            </Button>
                          )}
                          {(item.adjustment !== 0 || item.hasPendingChange) && (
                            <Button size="small" onClick={() => resetAdjustment(item.deviation)} sx={{ ml: 0.5, fontSize: "0.65rem", py: 0, minWidth: 0 }}>
                              reset
                            </Button>
                          )}
                        </Box>

                        {item.hasPendingChange && (
                          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "warning.main", fontStyle: "italic" }}>
                            Pending: {item.baseScore} {item.draftAdjustment >= 0 ? "+" : ""}{item.draftAdjustment} = {item.baseScore + item.draftAdjustment}
                            {bucketOf(item.baseScore + item.draftAdjustment) !== bucketOf(item.score) ? " — will move to a different column" : ""}. Click Confirm to apply.
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default CriticalityResults;
