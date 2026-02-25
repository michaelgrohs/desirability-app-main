import React, { createContext, useState, useContext, ReactNode } from 'react';

interface ExtractedElement {
  id: string;
  name: string;
}

interface TraceFitness {
  trace: string;
  conformance: number;
}
interface TraceSequence {
  trace: string;
  sequence: string[];
}
interface OutcomeBin {
  range: [number, number];
  traceCount: number;
  percentageEndingCorrectly: number;
}

export type ConformanceMode = 'bpmn' | 'declarative' | 'declarative-model';

interface DeviationSelection {
  column: string;   // exact matrix column name (e.g., "(Skip A)" or "Precedence_A_B")
  label: string;    // human-readable label
  type: string;     // 'skip' | 'insertion' | 'Precedence' | 'Response' | etc.
}

interface FileContextType {
  conformanceMode: ConformanceMode;
  setConformanceMode: React.Dispatch<React.SetStateAction<ConformanceMode>>;
  selectedDeviations: DeviationSelection[];
  setSelectedDeviations: React.Dispatch<React.SetStateAction<DeviationSelection[]>>;
  selectedDimensions: string[];
  setSelectedDimensions: React.Dispatch<React.SetStateAction<string[]>>;
}



export interface AttributeConformanceItem {
  value: string;
  averageConformance: number;
  traceCount?: number;
}

export type AttributeConformanceMap = Record<string, AttributeConformanceItem[]>;



export interface UniqueSequenceBin {
  bin: number;
  uniqueSequences: number;
  sequences: string[][];
}



interface ConformanceBin {
  averageConformance: number;
  traceCount: number;
}

export interface ActivityDeviation {
  name: string;
  skipped: number;
  inserted: number;
  skipped_percent: number;
  inserted_percent: number;
}

interface ActivityDeviationResult {
  deviations: ActivityDeviation[];
  total_traces: number;
}

interface FileContextType {
  // Conformance mode
  conformanceMode: ConformanceMode;
  setConformanceMode: React.Dispatch<React.SetStateAction<ConformanceMode>>;

  // File contents
  bpmnFileContent: string | null;
  xesFileContent: string | null;


  amountConformanceData: any[];
  setAmountConformanceData: React.Dispatch<React.SetStateAction<any[]>>;

  // Extracted BPMN elements
  extractedElements: ExtractedElement[];

  // Conformance data
  fitnessData: TraceFitness[];
  conformanceBins: ConformanceBin[];




  // Activity deviation stats
  activityDeviations: ActivityDeviationResult;
  outcomeBins: OutcomeBin[];
 desiredOutcomes: string[];
 matching_mode: string;
 attributeConformance: AttributeConformanceMap;
 uniqueSequences: UniqueSequenceBin[];
setUniqueSequences: React.Dispatch<React.SetStateAction<UniqueSequenceBin[]>>;


  // Setters
  setBpmnFileContent: (content: string | null) => void;
  setXesFileContent: (content: string | null) => void;
  setExtractedElements: (elements: ExtractedElement[]) => void;
  setFitnessData: (data: TraceFitness[]) => void;
  setConformanceBins: (bins: ConformanceBin[]) => void;
  setActivityDeviations: (data: ActivityDeviationResult) => void;
  setOutcomeBins: (bins: OutcomeBin[]) => void;
  setDesiredOutcomes: (outcomes: string[]) => void;
  setmatching_mode: (mode: string) => void;
  setAttributeConformance: (data: AttributeConformanceMap) => void;
  traceSequences: TraceSequence[];
setTraceSequences: React.Dispatch<React.SetStateAction<TraceSequence[]>>;

  // Persisted dimension configuration from SelectDimensions
  dimensionConfigs: Record<string, any>;
  setDimensionConfigs: React.Dispatch<React.SetStateAction<Record<string, any>>>;

  // Reset everything
  resetAll: () => void;

  // Outcome distribution

}

// Create context
const FileContext = createContext<FileContextType | undefined>(undefined);

// Provider component
export const FileProvider = ({ children }: { children: ReactNode }) => {
  const [conformanceMode, setConformanceMode] = useState<ConformanceMode>('bpmn');
  const [bpmnFileContent, setBpmnFileContent] = useState<string | null>(null);
  const [xesFileContent, setXesFileContent] = useState<string | null>(null);
  const [extractedElements, setExtractedElements] = useState<ExtractedElement[]>([]);
  const [fitnessData, setFitnessData] = useState<TraceFitness[]>([]);
  const [traceSequences, setTraceSequences] = useState<TraceSequence[]>([]);
  const [conformanceBins, setConformanceBins] = useState<ConformanceBin[]>([]);
  const [selectedDeviations, setSelectedDeviations] = useState<DeviationSelection[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [activityDeviations, setActivityDeviations] = useState<ActivityDeviationResult>({
    deviations: [],
    total_traces: 0
  });
  const [uniqueSequences, setUniqueSequences] = useState<UniqueSequenceBin[]>([]);
  const [amountConformanceData, setAmountConformanceData] = useState<any[]>([]);
  const [dimensionConfigs, setDimensionConfigs] = useState<Record<string, any>>({});



  
  const [outcomeBins, setOutcomeBins] = useState<OutcomeBin[]>([]);
  const [desiredOutcomes, setDesiredOutcomes] = useState<string[]>([]);
  const [matching_mode, setmatching_mode] = useState<string>('');
  const [attributeConformance, setAttributeConformance] = useState<AttributeConformanceMap>({});

  const resetAll = () => {
    setConformanceMode('bpmn');
    setBpmnFileContent(null);
    setXesFileContent(null);
    setExtractedElements([]);
    setFitnessData([]);
    setTraceSequences([]);
    setConformanceBins([]);
    setSelectedDeviations([]);
    setSelectedDimensions([]);
    setActivityDeviations({ deviations: [], total_traces: 0 });
    setUniqueSequences([]);
    setAmountConformanceData([]);
    setOutcomeBins([]);
    setDesiredOutcomes([]);
    setmatching_mode('');
    setAttributeConformance({});
    setDimensionConfigs({});
  };

  return (
    <FileContext.Provider
      value={{
        conformanceMode,
        setConformanceMode,
        bpmnFileContent,
        xesFileContent,
        extractedElements,
        setBpmnFileContent,
        setXesFileContent,
        setExtractedElements,
        fitnessData,
        setFitnessData,
        conformanceBins,
        setConformanceBins,
        activityDeviations,
        setActivityDeviations,
        outcomeBins,
setOutcomeBins,
desiredOutcomes,
setDesiredOutcomes,
          matching_mode,
          setmatching_mode,
  attributeConformance,
  setAttributeConformance,
setUniqueSequences,
  uniqueSequences,
   amountConformanceData,
  setAmountConformanceData,
traceSequences,
setTraceSequences,
selectedDeviations,
  setSelectedDeviations,
  selectedDimensions,
  setSelectedDimensions,
  dimensionConfigs,
  setDimensionConfigs,
  resetAll,

      }}
    >
      {children}
    </FileContext.Provider>
  );
};

// Hook for using context
export const useFileContext = (): FileContextType => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
};





