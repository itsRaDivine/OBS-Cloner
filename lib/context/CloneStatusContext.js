'use client';

import { createContext, useContext, useState } from 'react';

// Klonlama işlemi devam ederken sayfa navigasyonunu (dil değiştirme,
// logo tıklama vb.) engellemek için kullanılan global paylaşılan state.
// HeaderIsland ve ana sayfa (page.js) bu context üzerinden haberleşir.
const CloneStatusContext = createContext({
  isCloning: false,
  setIsCloning: () => {}
});

export function CloneStatusProvider({ children }) {
  const [isCloning, setIsCloning] = useState(false);
  return (
    <CloneStatusContext.Provider value={{ isCloning, setIsCloning }}>
      {children}
    </CloneStatusContext.Provider>
  );
}

export function useCloneStatus() {
  return useContext(CloneStatusContext);
}
