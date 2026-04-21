import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { workflowCallouts, workflowComparison } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';
import { TimelineStrip } from '../shared/TimelineStrip';

gsap.registerPlugin(ScrollTrigger);

export function WorkflowScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const legacySteps = gsap.utils.toArray('.workflow-legacy .timeline-strip__step');
      const agentSteps = gsap.utils.toArray('.workflow-agent .timeline-strip__step');

      if (reduced) {
        gsap.from([...copyLines, ...legacySteps, ...agentSteps], {
          y: 28,
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
          legacySteps,
          { x: -86, autoAlpha: 0, scale: 0.94 },
          { x: 0, autoAlpha: 1, scale: 1, duration: 0.84, stagger: 0.07, ease: 'back.out(1.08)' },
          0.12
        )
        .fromTo(
          '.workflow-agent',
          { xPercent: 12, autoAlpha: 0.2, scale: 0.97 },
          { xPercent: 0, autoAlpha: 1, scale: 1, duration: 0.82, ease: 'expo.out' },
          0.22
        )
        .fromTo(
          agentSteps,
          { x: 92, autoAlpha: 0, scale: 0.94 },
          { x: 0, autoAlpha: 1, scale: 1, duration: 0.84, stagger: 0.08, ease: 'back.out(1.08)' },
          0.24
        )
        .fromTo(
          '.workflow-score',
          { scale: 0.6, autoAlpha: 0 },
          { scale: 1, autoAlpha: 1, ease: 'back.out(1.5)' },
          0.56
        )
        .to('.workflow-core__beam', { scaleY: 1, autoAlpha: 1, duration: 0.8, ease: 'expo.out' }, 0.58)
        .fromTo(
          '.workflow-voice, .workflow-result, .workflow-callout',
          { y: 28, autoAlpha: 0, scale: 0.9 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.76, stagger: 0.08, ease: 'back.out(1.14)' },
          0.66
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene workflow-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="orange" size="lg" className="scene-orb scene-orb--workflow-a" />
        <GlowOrb color="green" size="xl" className="scene-orb scene-orb--workflow-b" />

        <div className="scene-stack">
          <div className="scene-copy scene-copy--wide">
            <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
            <h2 className="scene-title reveal-line">{act.title}</h2>
            <p className="scene-hook reveal-line">{act.hook}</p>
            <p className="scene-support reveal-line">{act.support}</p>
          </div>

          <div className="workflow-stage">
            <div className="workflow-scanline" />

            <TimelineStrip
              title="旧工作流"
              steps={workflowComparison.legacy}
              variant="legacy"
              className="workflow-legacy"
            />

            <div className="workflow-core">
              <div className="workflow-core__beam" />
              <div className="workflow-score">{act.metrics?.[0]?.value}</div>
              <p className="workflow-score__label">{act.metrics?.[0]?.label}</p>
              <div className="workflow-voice">“同意发布”</div>
              <div className="workflow-result">Published</div>
            </div>

            <TimelineStrip
              title="Agent 工作流"
              steps={workflowComparison.agent}
              variant="agent"
              className="workflow-agent"
            />
          </div>

          <div className="workflow-callouts">
            {workflowCallouts.map((callout) => (
              <div key={callout} className="workflow-callout">
                {callout}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
