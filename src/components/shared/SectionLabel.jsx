import React from 'react';

const modeLabel = {
  pinned: 'PINNED SEQUENCE',
  flow: 'FLOW SCROLL',
  mixed: 'HYBRID FLOW'
};

export function SectionLabel({ chapter, mode, hint }) {
  return (
    <div className="section-label">
      <span className="section-label__chapter">{chapter}</span>
      <span className="section-label__mode">{modeLabel[mode] || modeLabel.flow}</span>
      {hint ? <span className="section-label__hint">{hint}</span> : null}
    </div>
  );
}
