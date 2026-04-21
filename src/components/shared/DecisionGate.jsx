import React from 'react';

function StepList({ title, lead, steps, side }) {
  return (
    <section className={`decision-gate__panel decision-gate__panel--${side}`}>
      <p className="decision-gate__panel-kicker">{side === 'left' ? 'CONSULT' : 'ACT'}</p>
      <h3>{title}</h3>
      <p className="decision-gate__panel-lead">{lead}</p>
      <div className="decision-gate__steps">
        {steps.map((step, index) => (
          <div key={`${title}-${step}`} className="decision-gate__step">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DecisionGate({ leftTitle, leftLead, leftSteps, rightTitle, rightLead, rightSteps }) {
  return (
    <div className="decision-gate">
      <StepList title={leftTitle} lead={leftLead} steps={leftSteps} side="left" />

      <div className="decision-gate__core" aria-hidden="true">
        <div className="decision-gate__door decision-gate__door--left" />
        <div className="decision-gate__beam" />
        <div className="decision-gate__door decision-gate__door--right" />
      </div>

      <StepList title={rightTitle} lead={rightLead} steps={rightSteps} side="right" />
    </div>
  );
}
