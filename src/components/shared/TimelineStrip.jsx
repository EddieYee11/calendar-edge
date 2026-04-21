import React from 'react';

export function TimelineStrip({ title, steps, variant = 'legacy', direction = 'column', className = '' }) {
  return (
    <article className={`timeline-strip timeline-strip--${variant} timeline-strip--${direction} ${className}`.trim()}>
      <header className="timeline-strip__header">
        <span className="timeline-strip__header-kicker">{variant === 'legacy' ? 'PAST FLOW' : 'AGENT FLOW'}</span>
        <h3>{title}</h3>
      </header>

      <div className="timeline-strip__list">
        {steps.map((step, index) => (
          <div
            key={`${title}-${step.label}`}
            className={`timeline-strip__step is-${step.state || variant}`}
          >
            <span className="timeline-strip__count">{String(index + 1).padStart(2, '0')}</span>
            <p>{step.label}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
