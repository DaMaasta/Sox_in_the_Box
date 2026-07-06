import type React from "react";

const SQUARES: [number, number][] = [
  // Stamm
  [140, 110], [140, 170], [140, 230], [140, 290], [140, 350],
  // Oberer Arm
  [200, 230], [260, 170], [320, 110],
  // Unterer Arm
  [260, 290], [320, 350],
];

const KistleLogoOutline: React.FC = () => {
  return (
    <svg width="40" height="40" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      {SQUARES.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x} y={y} width="52" height="52"
          fill="none" stroke="currentColor" strokeWidth="6"
        />
      ))}
    </svg>
  );
};

export default KistleLogoOutline;
