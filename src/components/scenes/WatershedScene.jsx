import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { watershedComparison } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { DecisionGate } from '../shared/DecisionGate';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function WatershedScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const leftSteps = gsap.utils.toArray('.decision-gate__panel--left .decision-gate__step');
      const rightSteps = gsap.utils.toArray('.decision-gate__panel--right .decision-gate__step');

      if (reduced) {
        gsap.from([...copyLines, ...leftSteps, ...rightSteps], {
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
          leftSteps,
          { x: -54, autoAlpha: 0, scale: 0.94 },
          { x: 0, autoAlpha: 1, scale: 1, duration: 0.82, stagger: 0.06, ease: 'back.out(1.08)' },
          0.14
        )
        .fromTo(
          rightSteps,
          { x: 54, autoAlpha: 0, scale: 0.94 },
          { x: 0, autoAlpha: 1, scale: 1, duration: 0.82, stagger: 0.06, ease: 'back.out(1.08)' },
          0.22
        )
        .to('.decision-gate__door--left', { xPercent: -118, rotateY: 20, duration: 0.82, ease: 'expo.inOut' }, 0.56)
        .to('.decision-gate__door--right', { xPercent: 118, rotateY: -20, duration: 0.82, ease: 'expo.inOut' }, 0.56)
        .to('.decision-gate__beam', { scaleX: 1, autoAlpha: 1, duration: 0.78, ease: 'expo.out' }, 0.58)
        .to('.decision-gate__panel--right', { xPercent: -2, scale: 1.04, duration: 0.66, ease: 'back.out(1.12)' }, 0.64)
        .fromTo(
          '.watershed-claim',
          { y: 36, autoAlpha: 0, scale: 0.92 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.78, ease: 'back.out(1.2)' },
          0.74
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene watershed-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="orange" size="lg" className="scene-orb scene-orb--watershed-a" />
        <GlowOrb color="blue" size="xl" className="scene-orb scene-orb--watershed-b" />

        <div className="scene-stack">
          <div className="scene-copy scene-copy--wide">
            <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
            <h2 className="scene-title reveal-line">{act.title}</h2>
            <p className="scene-hook reveal-line">{act.hook}</p>
            <p className="scene-support reveal-line">{act.support}</p>
          </div>

          <DecisionGate
            leftTitle={watershedComparison.left.title}
            leftLead={watershedComparison.left.lead}
            leftSteps={watershedComparison.left.steps}
            rightTitle={watershedComparison.right.title}
            rightLead={watershedComparison.right.lead}
            rightSteps={watershedComparison.right.steps}
          />

          <div className="watershed-claim">从给答案，到替你执行。</div>
        </div>
      </div>
    </section>
  );
}
