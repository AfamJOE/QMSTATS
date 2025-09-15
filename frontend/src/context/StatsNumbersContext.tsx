// src/context/StatsNumbersContext.tsx
import React, { createContext, useContext, useState, useCallback } from "react";

type Registry = {
  /** true ⇢ this value is already used somewhere in the sheet */
  has: (val: string) => boolean;
  /** register a (section, value) pair — called onBlur/validate */
  add: (section: string, val: string) => void;
  /** remove an old value when the user edits or deletes a row */
  remove: (section: string, val: string) => void;
};

const dummy: Registry = { has: () => false, add: () => {}, remove: () => {} };

export const StatsNumbersContext = createContext<Registry>(dummy);
export const useStatsNumbers = () => useContext(StatsNumbersContext);

/* Provider you’ll wrap <FileCreation/> <Attachments/> <Rejects/> with */
export function StatsNumbersProvider({ children }: { children: React.ReactNode }) {
  /** internal map:  { value → Set(sectionsThatUseIt) } */
  const [map, setMap] = useState<Record<string, Set<string>>>({});

  const has = useCallback((val: string) => Boolean(map[val]), [map]);

  const add = useCallback((section: string, val: string) => {
    if (!val) return;
    setMap((m) => {
      const copy = { ...m };
      copy[val] = copy[val] ? new Set(copy[val]).add(section) : new Set([section]);
      return copy;
    });
  }, []);

  const remove = useCallback((section: string, val: string) => {
    if (!val) return;
    setMap((m) => {
      const copy = { ...m };
      if (copy[val]) {
        copy[val].delete(section);
        if (copy[val].size === 0) delete copy[val];
      }
      return copy;
    });
  }, []);

  return (
    <StatsNumbersContext.Provider value={{ has, add, remove }}>
      {children}
    </StatsNumbersContext.Provider>
  );
}
