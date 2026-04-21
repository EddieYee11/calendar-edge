import React from 'react';

export function ProgressRail({ acts, activeId, progressBarRef, onSelect }) {
  return (
    <>
      <div className="progress-rail" aria-hidden="true">
        <span ref={progressBarRef} className="progress-rail__fill" />
      </div>

      <nav className="chapter-rail" aria-label="章节导航">
        {acts.map((act, index) => (
          <button
            type="button"
            key={act.id}
            onClick={() => onSelect?.(act.id)}
            aria-current={activeId === act.id ? 'step' : undefined}
            className={`chapter-rail__item ${activeId === act.id ? 'is-active' : ''}`}
          >
            <span className="chapter-rail__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="chapter-rail__title">{act.title}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
