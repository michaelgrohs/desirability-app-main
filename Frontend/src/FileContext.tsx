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

interface DeviationSelection {
  activity: string;
  type: 'skip' | 'insertion';
}

interface FileContextType {
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


  // Outcome distribution

}

// Create context
const FileContext = createContext<FileContextType | undefined>(undefined);

// Provider component
export const FileProvider = ({ children }: { children: ReactNode }) => {
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



  
  const [outcomeBins, setOutcomeBins] = useState<OutcomeBin[]>([]);
  const [desiredOutcomes, setDesiredOutcomes] = useState<string[]>([]);
  const [matching_mode, setmatching_mode] = useState<string>('');
  const [attributeConformance, setAttributeConformance] = useState<AttributeConformanceMap>({});



  return (
    <FileContext.Provider
      value={{
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
  setSelectedDimensions

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





