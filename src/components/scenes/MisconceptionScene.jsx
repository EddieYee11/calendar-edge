import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { misconceptionPanels } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function MisconceptionScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const cards = gsap.utils.toArray('.misconception-card');
      const pillars = gsap.utils.toArray('.action-pillar');

      if (reduced) {
        gsap.from([...copyLines, ...cards, ...pillars], {
          y: 24,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.05,
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
        { y: 30, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.82, stagger: 0.06, ease: 'expo.out' },
        0
      )
        .fromTo(
          cards,
          { y: 54, autoAlpha: 0, rotate: -8, scale: 0.92 },
          { y: 0, autoAlpha: 1, rotate: 0, scale: 1, duration: 0.84, stagger: 0.08, ease: 'back.out(1.12)' },
          0.12
        )
        .fromTo(
          '.misconception-divider',
          { scaleX: 0, autoAlpha: 0 },
          { scaleX: 1, autoAlpha: 1, duration: 0.7, transformOrigin: 'left center', ease: 'expo.out' },
          0.5
        )
        .fromTo(
          pillars,
          { y: 60, autoAlpha: 0, scale: 0.86 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.84, stagger: 0.06, ease: 'back.out(1.18)' },
          0.4
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene misconception-scene"
    >
      <GlowOrb color="orange" size="lg" className="scene-orb scene-orb--misconception-a" />

      <div className="scene-grid scene-grid--misconception">
        <div className="scene-copy">
          <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
          <h2 className="scene-title reveal-line">{act.title}</h2>
          <p className="scene-hook reveal-line">{act.hook}</p>
          <p className="scene-support reveal-line">{act.support}</p>
        </div>

        <div className="misconception-stage">
          <div className="misconception-cards">
            {misconceptionPanels.map((panel) => (
              <article key={panel.id} className="misconception-card">
                <p className="misconception-card__label">{panel.label}</p>
                <h3>{panel.title}</h3>
                <p>{panel.body}</p>
              </article>
            ))}
          </div>

          <div className="misconception-divider" />

          <div className="action-pillar-row">
            {act.steps?.map((step) => (
              <article key={step.label} className={`action-pillar is-${step.state || 'agent'}`}>
                <span>{step.label}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
