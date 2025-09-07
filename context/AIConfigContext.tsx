import React, { createContext, useContext, useState, type PropsWithChildren } from 'react';

export type AIMode = 'hf' | 'mock';

type Ctx = {
  mode: AIMode;
  setMode: (m: AIMode) => void;
};

const AIConfigContext = createContext<Ctx>({ mode: 'hf', setMode: () => {} });

export const AIConfigProvider = ({ children }: PropsWithChildren) => {
  const [mode, setMode] = useState<AIMode>('hf');
  return (
    <AIConfigContext.Provider value={{ mode, setMode }}>
      {children}
    </AIConfigContext.Provider>
  );
};

export const useAIConfig = () => useContext(AIConfigContext);

export default AIConfigContext;
