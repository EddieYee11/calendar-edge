import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { MetricCard } from '../shared/MetricCard';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

const accents = ['blue', 'green', 'orange'];

export function MetricsScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const cards = gsap.utils.toArray('.metric-card');
      const values = gsap.utils.toArray('.metric-card__value');

      if (reduced) {
        gsap.from([...copyLines, ...cards], {
          y: 24,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.08,
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
          { y: 70, autoAlpha: 0, rotateX: -18, scale: 0.92 },
          { y: 0, autoAlpha: 1, rotateX: 0, scale: 1, duration: 0.9, stagger: 0.1, ease: 'back.out(1.15)' },
          0.08
        )
        .fromTo(
          values,
          { scale: 0.62 },
          { scale: 1.18, duration: 0.6, stagger: 0.09, ease: 'back.out(1.36)' },
          0.25
        )
        .to(values, { scale: 1, duration: 0.2, stagger: 0.08, ease: 'power2.out' }, 0.78)
        .fromTo(
          '.metrics-track',
          { xPercent: 16, autoAlpha: 0 },
          { xPercent: 0, autoAlpha: 1, duration: 0.82, ease: 'expo.out' },
          0.12
        )
        .fromTo(
          '.metrics-statement',
          { y: 30, autoAlpha: 0, scale: 0.92 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.76, ease: 'back.out(1.18)' },
          0.48
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene metrics-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="blue" size="xl" className="scene-orb scene-orb--metrics-a" />
        <GlowOrb color="green" size="lg" className="scene-orb scene-orb--metrics-b" />

        <div className="scene-grid scene-grid--metrics">
          <div className="scene-copy">
            <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
            <h2 className="scene-title reveal-line">{act.title}</h2>
            <p className="scene-hook reveal-line">{act.hook}</p>
            <p className="scene-support reveal-line">{act.support}</p>

            <div className="anchor-row reveal-line">
              {act.anchors?.map((anchor) => (
                <span key={anchor} className="anchor-chip">
                  {anchor}
                </span>
              ))}
            </div>

            <div className="metrics-statement">不是协助，而是独立完成。</div>
          </div>

          <div className="metrics-stage">
            <div className="metrics-track">
              {['write', 'edit', 'upload', 'schedule', 'review', 'publish', 'report', 'sync'].map((item) => (
                <span key={item} className="metrics-track__item">
                  {item}
                </span>
              ))}
            </div>

            <div className="metrics-grid">
              {act.metrics?.map((metric, index) => (
                <MetricCard
                  key={metric.label}
                  value={metric.value}
                  label={metric.label}
                  note={metric.note}
                  accent={accents[index % accents.length]}
                  className={index === 2 ? 'metric-card--wide' : ''}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
