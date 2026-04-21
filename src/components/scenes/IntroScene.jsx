import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function IntroScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');

      if (reduced) {
        gsap.from(copyLines, {
          y: 28,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power2.out',
          stagger: 0.08,
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
        { y: 0, autoAlpha: 1, duration: 0.86, stagger: 0.06, ease: 'expo.out' },
        0
      )
        .fromTo(
          '.anchor-chip',
          { y: 18, autoAlpha: 0, scale: 0.9 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.7, stagger: 0.05, ease: 'back.out(1.15)' },
          0.08
        )
        .fromTo(
          '.intro-gear',
          { scale: 0.6, autoAlpha: 0.18, rotate: -18 },
          { scale: 1, autoAlpha: 0.78, rotate: 0, duration: 0.92, stagger: 0.05, ease: 'back.out(1.18)' },
          0.04
        )
        .fromTo(
          '.intro-belt__item',
          { xPercent: -80, autoAlpha: 0 },
          { xPercent: 0, autoAlpha: 1, duration: 0.76, stagger: 0.05, ease: 'expo.out' },
          0.12
        )
        .fromTo(
          '.intro-brain',
          { autoAlpha: 0, scale: 0.72, filter: 'blur(18px)' },
          { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.96, ease: 'expo.out' },
          0.3
        )
        .fromTo(
          '.intro-node',
          { scale: 0.2, autoAlpha: 0 },
          { scale: 1, autoAlpha: 1, duration: 0.62, stagger: 0.03, ease: 'back.out(1.35)' },
          0.42
        )
        .to('.intro-gridline', { backgroundPositionX: '120px', duration: 1.2, ease: 'sine.out' }, 0);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene intro-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="blue" size="xl" className="scene-orb scene-orb--intro-a" />
        <GlowOrb color="green" size="lg" className="scene-orb scene-orb--intro-b" />

        <div className="scene-grid">
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
          </div>

          <div className="intro-stage">
            <div className="intro-gridline" />
            <div className="intro-gear intro-gear--large" />
            <div className="intro-gear intro-gear--small" />

            <div className="intro-belt">
              {act.steps?.map((step) => (
                <span key={step.label} className="intro-belt__item">
                  {step.label}
                </span>
              ))}
            </div>

            <svg className="intro-brain" viewBox="0 0 520 420" aria-hidden="true">
              <path d="M140 220C140 120 210 90 260 90C305 90 380 120 380 220C380 320 320 344 260 344C205 344 140 310 140 220Z" />
              <path d="M190 160L240 204L208 258" />
              <path d="M320 156L280 210L326 260" />
              <path d="M236 198L286 198" />
              <path d="M222 272L286 272" />
              <circle className="intro-node" cx="190" cy="160" r="8" />
              <circle className="intro-node" cx="240" cy="204" r="8" />
              <circle className="intro-node" cx="208" cy="258" r="8" />
              <circle className="intro-node" cx="320" cy="156" r="8" />
              <circle className="intro-node" cx="280" cy="210" r="8" />
              <circle className="intro-node" cx="326" cy="260" r="8" />
              <circle className="intro-node" cx="286" cy="198" r="8" />
              <circle className="intro-node" cx="286" cy="272" r="8" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
