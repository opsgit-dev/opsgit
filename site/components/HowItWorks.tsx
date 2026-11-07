"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Icon } from "./Icons";
import { iso, f } from "@/lib/iso";

const STEPS: Array<{ icon: "braces" | "pr" | "merge" | "zap"; title: string; text: React.ReactNode }> = [
  { icon: "braces", title: "Write a flag", text: <>One JSON file per flag in <code>flags/</code>. Rules, rollouts, segments, expiry, and an owner. Your editor autocompletes it from the schema.</> },
  { icon: "pr", title: "Open a pull request", text: <>The action validates every file, runs your fixtures, and posts a plain-English preview: what changed, for whom, and by how much.</> },
  { icon: "merge", title: "Merge", text: <>The flags are compiled into a Worker and deployed to your Cloudflare account. Global in seconds. No database to warm up.</> },
  { icon: "zap", title: "Evaluate", text: <>Servers download the bundle once and evaluate in-process. Browsers and apps call the Worker with a client key that never sees a rule.</> },
];

/** The edge as an isometric lattice. The flag plants on merge and the deploy lights every node. */
function Lattice() {
  const cx = 160, cy = 72, u = 36, h = 66, n = 4;
  const P = (i: number, j: number) => iso(cx, cy, i, j, u);
  const grid: string[] = [];
  for (let k = 0; k <= n; k++) { grid.push(`M${f(P(k, 0))}L${f(P(k, n))}`, `M${f(P(0, k))}L${f(P(n, k))}`); }
  const D = P(0, n), C = P(n, n), B = P(n, 0);
  for (let k = 0; k <= n; k++) { grid.push(`M${f(P(k, n))}l0 ${h}`, `M${f(P(n, k))}l0 ${h}`); }
  for (let t = 1; t <= n; t++) {
    const y = (h * t) / n;
    grid.push(`M${D[0].toFixed(1)} ${(D[1] + y).toFixed(1)}L${C[0].toFixed(1)} ${(C[1] + y).toFixed(1)}`, `M${C[0].toFixed(1)} ${(C[1] + y).toFixed(1)}L${B[0].toFixed(1)} ${(B[1] + y).toFixed(1)}`);
  }
  const solid = `M${f(P(0, 0))}L${f(P(n, 0))}L${f(P(n, n))}L${f(P(0, n))}Z M${f(P(0, n))}l0 ${h}L${C[0].toFixed(1)} ${(C[1] + h).toFixed(1)}L${f(C)} M${C[0].toFixed(1)} ${(C[1] + h).toFixed(1)}L${B[0].toFixed(1)} ${(B[1] + h).toFixed(1)}L${f(B)}`;
  const dots: React.ReactNode[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    if (i === 2 && j === 2) continue;
    const dist = Math.abs(i - 2) + Math.abs(j - 2);
    const [x, y] = P(i, j);
    dots.push(<circle className="dot" r="2.2" cx={x.toFixed(1)} cy={y.toFixed(1)} key={`${i}${j}`} style={{ "--d": `${(1.15 + 0.16 * dist).toFixed(2)}s` } as CSSProperties} />);
  }
  const ctr = P(2, 2), k = 1.35;
  return (
    <svg viewBox="0 0 320 320">
      <path className="lat" d={grid.join("")} />
      <path className="lat-solid" d={solid} />
      <g className="pr" transform="translate(214 18)">
        <rect className="prbox" width="92" height="56" rx="10" />
        <path className="prline" d="M14 18h30M14 30h50M14 42h22" />
        <circle className="prcheck" cx="76" cy="18" r="7" />
        <path className="prtick" d="M72.5 18.5l2.5 2.5 4.5-4.5" />
      </g>
      <g className="dots">{dots}</g>
      <g className="ring" transform={`translate(${ctr[0].toFixed(1)} ${ctr[1].toFixed(1)})`}>
        <ellipse className="wave" rx="1" ry="0.5" vectorEffect="non-scaling-stroke" />
        <ellipse className="wave w2" rx="1" ry="0.5" vectorEffect="non-scaling-stroke" />
      </g>
      <ellipse className="shadow" cx={ctr[0].toFixed(1)} cy={ctr[1].toFixed(1)} rx="22" ry="8" />
      <g transform={`translate(${(ctr[0] - 14 * k).toFixed(1)} ${(ctr[1] - 54 * k).toFixed(1)}) scale(${k})`}>
        <g className="flag">
          <path className="pole" d="M14 54V24c0-8 6-12 14-12" />
          <path className="pennant" d="M28 12h24l-9 11 9 11H28c-8 0-14 4-14 12V24c0-8 6-12 14-12z" />
          <circle className="base" cx="14" cy="54" r="4.5" />
        </g>
      </g>
    </svg>
  );
}

export function HowItWorks() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrolly = root.current;
    if (!scrolly) return;
    const isoEl = scrolly.querySelector<HTMLElement>(".iso")!;
    const steps = Array.from(scrolly.querySelectorAll<HTMLElement>(".step-item"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      isoEl.classList.add("in", "s1", "s2", "s3");
      steps.forEach((s) => s.classList.add("active"));
      return;
    }
    let cleanup = () => {};
    let cancelled = false;

    // Scrubbed to scroll with GSAP ScrollTrigger, like the reference's cube (a Webflow "while scrolling" action with smoothing).
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      isoEl.classList.add("gsap");
      const q = (sel: string) => isoEl.querySelectorAll(sel);
      const dots = Array.from(q(".dot") as NodeListOf<SVGCircleElement>).sort((a, b) => parseFloat(a.style.getPropertyValue("--d")) - parseFloat(b.style.getPropertyValue("--d")));
      const signal = "#ff4d1c", lineStrong = "#d9d5cc", paper = "#f8f7f3";
      gsap.set(q(".lat, .lat-solid"), { opacity: 0 });
      gsap.set(q(".flag"), { opacity: 0, y: -140 });
      gsap.set(q(".shadow"), { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" });
      gsap.set(q(".pr"), { opacity: 0, y: 8 });
      gsap.set(q(".prtick"), { opacity: 0 });
      gsap.set(q(".wave"), { opacity: 0, scale: 1, transformOrigin: "50% 50%" });
      gsap.set(dots, { fill: paper, stroke: lineStrong, scale: 1, transformOrigin: "50% 50%" });
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.to(q(".lat, .lat-solid"), { opacity: 1, duration: 1 }, 0)                       // 1. the edge appears
        .to(q(".flag"), { opacity: 0.6, y: -92, duration: 1 }, 0.4)                        //    the flag exists above it
        .to(q(".shadow"), { opacity: 0.06, scale: 0.7, duration: 0.6 }, 0.6)
        .to(q(".flag"), { opacity: 1, duration: 0.5 }, 2.4)                                // 2. the pull request
        .to(q(".pr"), { opacity: 1, y: 0, duration: 0.8 }, 2.4)
        .to(q(".prcheck"), { fill: signal, stroke: signal, duration: 0.4 }, 3.1)
        .to(q(".prtick"), { opacity: 1, duration: 0.3 }, 3.3)
        .to(q(".flag"), { y: 0, duration: 1, ease: "back.out(1.6)" }, 5)                   // 3. merge: the flag plants
        .to(q(".shadow"), { opacity: 0.12, scale: 1, duration: 0.8 }, 5.1)
        .to(q(".pr"), { opacity: 0.35, duration: 0.6 }, 5)
        .fromTo(q(".wave"), { opacity: 0.6, scale: 1 }, { opacity: 0, scale: 130, duration: 1.6, ease: "power1.out", stagger: 0.3 }, 5.6)
        .to(dots, { fill: signal, stroke: signal, scale: 1.25, opacity: 0.85, duration: 0.4, stagger: 0.06 }, 7.2); // 4. every node lights
      const main = ScrollTrigger.create({
        trigger: scrolly, start: "top 60%", end: "bottom 70%", animation: tl, scrub: 0.6,
        onUpdate: (self) => isoEl.classList.toggle("loop", self.progress > 0.97),
      });
      const stepTriggers = steps.map((el) => ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", toggleClass: { targets: el, className: "active" } }));
      ScrollTrigger.refresh();
      cleanup = () => { main.kill(); stepTriggers.forEach((t) => t.kill()); tl.kill(); };
    }).catch(() => {
      // No GSAP: one stage per step.
      isoEl.classList.add("in");
      const tick = () => {
        const line = window.innerHeight * 0.55; let n = 0;
        steps.forEach((s, i) => { if (s.getBoundingClientRect().top < line) n = i; });
        isoEl.classList.toggle("s1", n >= 1); isoEl.classList.toggle("s2", n >= 2); isoEl.classList.toggle("s3", n >= 3);
        steps.forEach((s, i) => s.classList.toggle("active", i === n));
      };
      window.addEventListener("scroll", tick, { passive: true }); tick();
      cleanup = () => window.removeEventListener("scroll", tick);
    });
    return () => { cancelled = true; cleanup(); };
  }, []);

  return (
    <section id="how">
      <div className="wrap">
        <div className="center stack" style={{ marginBottom: 24 }}>
          <p className="eyebrow">How it works</p>
          <h2 className="h2">Four steps, all of them in git</h2>
        </div>
        <div className="scrolly" ref={root}>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step-item" data-step={i} key={s.title}>
                <div className="step-head"><span className="ic"><Icon name={s.icon} strokeWidth={1.6} /></span><span className="step">0{i + 1}</span></div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <div className="sticky">
            <div className="iso" aria-hidden="true"><Lattice /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
