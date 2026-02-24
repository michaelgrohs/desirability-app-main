import React, { createContext, useContext, useState, useCallback } from "react";

export interface ContinueConfig {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface BottomNavContextType {
  continueConfig: ContinueConfig | null;
  setContinue: (config: ContinueConfig | null) => void;
  hideBack: boolean;
  setHideBack: (hide: boolean) => void;
}

const BottomNavContext = createContext<BottomNavContextType>({
  continueConfig: null,
  setContinue: () => {},
  hideBack: false,
  setHideBack: () => {},
});

export const BottomNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [continueConfig, setContinueConfig] = useState<ContinueConfig | null>(null);
  const [hideBack, setHideBack] = useState(false);

  const setContinue = useCallback((config: ContinueConfig | null) => {
    setContinueConfig(config);
  }, []);

  return (
    <BottomNavContext.Provider value={{ continueConfig, setContinue, hideBack, setHideBack }}>
      {children}
    </BottomNavContext.Provider>
  );
};

export const useBottomNav = () => useContext(BottomNavContext);
