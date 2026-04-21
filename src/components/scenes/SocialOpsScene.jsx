import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { socialActions, socialFeed, socialOutput } from '../../content';
import { prefersReducedMotion } from '../../lib/motion';
import { BrowserMock } from '../shared/BrowserMock';
import { GlowOrb } from '../shared/GlowOrb';
import { SectionLabel } from '../shared/SectionLabel';

gsap.registerPlugin(ScrollTrigger);

export function SocialOpsScene({ act }) {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    const ctx = gsap.context(() => {
      const copyLines = gsap.utils.toArray('.reveal-line');
      const posts = gsap.utils.toArray('.browser-mock__post');
      const chips = gsap.utils.toArray('.browser-mock__chip');
      const browser = sectionRef.current?.querySelector('.browser-mock');

      if (reduced) {
        gsap.from(browser ? [...copyLines, browser] : copyLines, {
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
          '.browser-mock',
          { scale: 0.92, autoAlpha: 0, y: 40 },
          { scale: 1, autoAlpha: 1, y: 0, duration: 0.92, ease: 'back.out(1.08)' },
          0.1
        )
        .fromTo(
          posts,
          { y: 90, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.78, stagger: 0.06, ease: 'expo.out' },
          0.22
        )
        .fromTo(
          chips,
          { scale: 0.7, autoAlpha: 0 },
          { scale: 1, autoAlpha: 1, duration: 0.64, stagger: 0.05, ease: 'back.out(1.15)' },
          0.56
        )
        .fromTo(
          '.browser-mock__draft',
          { x: 40, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out' },
          0.66
        )
        .fromTo(
          '.browser-mock__execute',
          { scale: 0.72, autoAlpha: 0 },
          { scale: 1, autoAlpha: 1, duration: 0.86, ease: 'elastic.out(1, 0.78)' },
          0.8
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id={act.id}
      ref={sectionRef}
      data-act-id={act.id}
      className="scene social-scene"
    >
      <div className="scene__pin">
        <GlowOrb color="blue" size="lg" className="scene-orb scene-orb--social-a" />
        <GlowOrb color="green" size="xl" className="scene-orb scene-orb--social-b" />

        <div className="scene-grid scene-grid--social">
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

          <BrowserMock posts={socialFeed} actions={socialActions} output={socialOutput} />
        </div>
      </div>
    </section>
  );
}
