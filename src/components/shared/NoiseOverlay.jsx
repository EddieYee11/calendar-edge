import React from 'react';

export function NoiseOverlay() {
  return (
    <div className="noise-overlay" aria-hidden="true">
      <div className="noise-overlay__mesh" />
      <div className="noise-overlay__scanlines" />
      <div className="noise-overlay__grain" />
      <div className="noise-overlay__vignette" />
    </div>
  );
}
