import React from 'react';

export function MetricCard({ value, label, note, accent = 'blue', className = '' }) {
  return (
    <article className={`metric-card metric-card--${accent} ${className}`.trim()}>
      <p className="metric-card__label">{label}</p>
      <strong className="metric-card__value">{value}</strong>
      {note ? <p className="metric-card__note">{note}</p> : null}
    </article>
  );
}
