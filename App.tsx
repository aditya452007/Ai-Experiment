import React from 'react';
import NeonGame from './components/NeonGame';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050505] relative text-white select-none">
      <NeonGame />
      <div className="scanlines pointer-events-none" />
    </div>
  );
};

export default App;