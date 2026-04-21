import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { finalQuestions } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function FinaleScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const questions = gsap.utils.toArray('.final-question');
      const verdict = sectionRef.current?.querySelector('.final-verdict');

      if (reduced) {
        gsap.from(verdict ? [...copyLines, ...questions, verdict] : [...copyLines, ...questions], {
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
        { y: 30, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.82, stagger: 0.06, ease: 'expo.out' },
        0
      )
        .fromTo(
          questions,
          { y: 58, autoAlpha: 0, scale: 0.92 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 0.82, stagger: 0.08, ease: 'back.out(1.16)' },
          0.12
        )
        .to('.final-gate__door--left', { xPercent: -124, duration: 0.82, ease: 'expo.inOut' }, 0.4)
        .to('.final-gate__door--right', { xPercent: 124, duration: 0.82, ease: 'expo.inOut' }, 0.4)
        .to('.final-gate__beam', { scaleX: 1, autoAlpha: 1, duration: 0.76, ease: 'expo.out' }, 0.48)
        .fromTo(
          '.final-verdict',
          { scale: 0.72, autoAlpha: 0, filter: 'blur(20px)' },
          { scale: 1, autoAlpha: 1, filter: 'blur(0px)', duration: 0.9, ease: 'back.out(1.28)' },
          0.64
        )
        .fromTo(
          '.final-subline',
          { y: 28, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.76, ease: 'expo.out' },
          0.78
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene finale-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="orange" size="lg" className="scene-orb scene-orb--finale-a" />
        <GlowOrb color="green" size="xl" className="scene-orb scene-orb--finale-b" />

        <div className="scene-stack scene-stack--finale">
          <div className="scene-copy scene-copy--wide">
            <SectionLabel chapter={act.chapter} mode={act.visualMode} hint={act.durationHint} />
            <h2 className="scene-title reveal-line">{act.title}</h2>
            <p className="scene-hook reveal-line">{act.hook}</p>
            <p className="scene-support reveal-line">{act.support}</p>
          </div>

          <div className="final-questions">
            {finalQuestions.map((question) => (
              <article key={question} className="final-question">
                {question}
              </article>
            ))}
          </div>

          <div className="final-gate" aria-hidden="true">
            <div className="final-gate__door final-gate__door--left" />
            <div className="final-gate__beam" />
            <div className="final-gate__door final-gate__door--right" />
          </div>

          <div className="final-verdict">这不是焦虑，这是事实。</div>
          <p className="final-subline">AI 不是未来，AI 是现在。</p>
        </div>
      </div>
    </section>
  );
}
