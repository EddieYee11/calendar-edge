import React from 'react';

export function GlowOrb({ color = 'blue', size = 'md', className = '', style }) {
  return (
    <span
      aria-hidden="true"
      className={`glow-orb glow-orb--${color} glow-orb--${size} ${className}`.trim()}
      style={style}
    />
  );
}
