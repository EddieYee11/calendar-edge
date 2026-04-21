import React, { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { lifeScenarios } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function LifeScene({ act }) {
  const sectionRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray('.life-card');
      const copyLines = gsap.utils.toArray('.reveal-line');
      const preview = sectionRef.current?.querySelector('.life-preview');

      if (reduced) {
        gsap.from(preview ? [...copyLines, preview, ...cards] : [...copyLines, ...cards], {
          y: 24,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.06,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top bottom',
            once: true
          }
        });

        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top bottom',
          once: true
        }
      });

      tl.fromTo(
        copyLines,
        { y: 34, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.84, stagger: 0.06, ease: 'expo.out' },
        0
      )
        .fromTo(
          '.life-preview',
          { y: 28, autoAlpha: 0, scale: 0.96 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.82, ease: 'back.out(1.22)' },
          0.12
        )
        .fromTo(
          cards,
          { y: 64, autoAlpha: 0, scale: 0.9 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.86, stagger: 0.08, ease: 'back.out(1.2)' },
          0.22
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const activeScenario = lifeScenarios[activeIndex];

  return (
    <section id={act.id} ref={sectionRef} data-act-id={act.id} className="scene life-scene">
      <GlowOrb color="green" size="lg" className="scene-orb scene-orb--life-a" />

      <div className="life-layout">
        <div className="scene-copy life-copy">
          <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
          <h2 className="scene-title reveal-line">{act.title}</h2>
          <p className="scene-hook reveal-line">{act.hook}</p>
          <p className="scene-support reveal-line">{act.support}</p>

          <article className="life-preview">
            <p className="life-preview__eyebrow">CURRENT SCENARIO</p>
            <h3>{activeScenario.title}</h3>
            <p className="life-preview__prompt">{activeScenario.prompt}</p>
            <div className="life-preview__outcome">{activeScenario.outcome}</div>
          </article>
        </div>

        <div className="life-cards">
          {lifeScenarios.map((scenario, index) => (
            <article
              key={scenario.id}
              className={`life-card ${activeIndex === index ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              tabIndex={0}
            >
              <span className="life-card__index">{String(index + 1).padStart(2, '0')}</span>
              <div className="life-card__body">
                <h3>{scenario.title}</h3>
                <p className="life-card__prompt">{scenario.prompt}</p>
                <div className="life-card__actions">
                  {scenario.actions.map((action) => (
                    <span key={action}>{action}</span>
                  ))}
                </div>
                <p className="life-card__outcome">{scenario.outcome}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
