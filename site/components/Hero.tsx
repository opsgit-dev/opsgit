"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { REPO } from "./Nav";
import { iso, f, rhombus, face, skirt } from "@/lib/iso";

const INIT = "npx opsgit-flags init";

/** Left: the repo. Three file tiles, a branch rising from the top one, the flag at its end. */
function RepoStack() {
  const u = 22, w = 4, d = 3, t = 10;
  const tiles = [[95, 150], [95, 128], [95, 106]].map(([ox, oy], k) => {
    const r = rhombus(ox, oy, w, d, u);
    const m1 = iso(ox, oy, 0.8, 0.8, u), m2 = iso(ox, oy, 2.6, 0.8, u);
    return (
      <g className="tile" key={k}>
        <path className="face" d={face(r)} />
        <path className="d" d={skirt(r, t)} />
        <path className="d" d={`M${f(m1)}L${f(m2)}`} />
      </g>
    );
  });
  const top = iso(95, 106, 2, 1.5, u);
  return (
    <svg viewBox="0 0 200 220">
      {tiles}
      <g className="branch">
        <path className="d" d={`M${f(top)}V54c0-12 8-18 18-18h10`} />
        <circle className="s" cx={top[0].toFixed(1)} cy={top[1].toFixed(1)} r="4" />
      </g>
      <g className="bob"><g className="hflag"><path className="fs" d="M123 34V62" /><path className="f" d="M123 18h40l-11 12 11 12h-40z" /></g></g>
    </svg>
  );
}

/** Right: a rollout. A 4×4 plane of buckets fills in toward the flag, then resets. */
function Rollout() {
  const u = 21, n = 4, ox = 100, oy = 70;
  const tiles: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([di, dj]) => iso(ox, oy, i + di, j + dj, u));
    tiles.push(<path className="rt" data-k={i * 4 + j} key={`${i}-${j}`} d={`M${f(pts[0])}L${f(pts[1])}L${f(pts[2])}L${f(pts[3])}Z`} />);
  }
  const slab = rhombus(ox, oy, n, n, u);
  const cc = iso(ox, oy, n / 2, n / 2, u);
  const cx = cc[0].toFixed(1), cy = cc[1];
  return (
    <svg viewBox="0 0 200 220">
      <path className="d" d={skirt(slab, 16)} />
      {tiles}
      <g className="rflag">
        <path className="fs" d={`M${cx} ${cy.toFixed(1)}V${(cy - 46).toFixed(1)}`} />
        <path className="f" d={`M${cx} ${(cy - 60).toFixed(1)}h30l-8 9 8 9h-30z`} />
        <circle className="f" cx={cx} cy={cy.toFixed(1)} r="3.5" />
      </g>
    </svg>
  );
}

export function Hero() {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let cancelled = false;
    const kills: Array<() => void> = [];
    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const dl = left.current, dr = right.current;
      if (dl) {
        dl.classList.add("gsap");
        const tiles = dl.querySelectorAll(".tile"), branch = dl.querySelector(".branch"), hflag = dl.querySelector(".hflag"), bob = dl.querySelector(".bob");
        gsap.set(tiles, { opacity: 0, y: 18 }); gsap.set(branch, { opacity: 0 }); gsap.set(hflag, { scale: 0, transformOrigin: "0% 100%" });
        const tl = gsap.timeline({ delay: 0.3 })
          .to(tiles, { opacity: 1, y: 0, duration: 0.6, stagger: 0.18, ease: "power2.out" })
          .to(branch, { opacity: 1, duration: 0.5 }, "-=0.1")
          .to(hflag, { scale: 1, duration: 0.7, ease: "back.out(1.8)" }, "-=0.2")
          .to(bob, { y: -6, duration: 1.7, ease: "sine.inOut", yoyo: true, repeat: -1 });
        kills.push(() => tl.kill());
      }
      if (dr) {
        const rts = Array.from(dr.querySelectorAll<SVGPathElement>(".rt")).sort((a, b) => {
          const ka = +a.dataset.k!, kb = +b.dataset.k!;
          return (Math.floor(ka / 4) + ka % 4) - (Math.floor(kb / 4) + kb % 4) || ka - kb;
        });
        const rflag = dr.querySelector(".rflag");
        gsap.set(rflag, { scale: 0, transformOrigin: "50% 100%" });
        const tl = gsap.timeline({ delay: 0.8, repeat: -1, repeatDelay: 0.6 })
          .to(rflag, { scale: 1, duration: 0.6, ease: "back.out(1.8)" })
          .to(rts, { fill: "#ff4d1c", stroke: "#ff4d1c", duration: 0.35, stagger: 0.09, ease: "power1.out" }, "-=0.1")
          .to({}, { duration: 1.2 })
          .to(rts, { fill: "#ffffff", stroke: "#b5b1a9", duration: 0.5, ease: "power1.inOut" })
          .to(rflag, { scale: 0, duration: 0.4, ease: "power2.in" }, "-=0.3");
        kills.push(() => tl.kill());
      }
    });
    return () => { cancelled = true; kills.forEach((k) => k()); };
  }, []);

  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1400); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(INIT).then(done, () => select());
    else select();
    function select() {
      const el = document.getElementById("init-cmd");
      if (!el) return;
      const r = document.createRange(); r.selectNodeContents(el);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    }
  }

  return (
    <section className="hero center">
      <div className="doodle doodle-l" aria-hidden="true" ref={left}><RepoStack /></div>
      <div className="doodle doodle-r" aria-hidden="true" ref={right}><Rollout /></div>
      <div className="wrap">
        <h1>Turn features on with a pull request</h1>
        <p className="lead narrow">
          opsgit keeps your feature flags as plain JSON files in your repo. Change one in a PR, see exactly who it will affect before you merge, and ship it to a Cloudflare Worker you own. No dashboard, no vendor, no seats.
        </p>
        <div className="cta">
          <div className="cmd">
            <span id="init-cmd">{INIT}</span>
            <button type="button" aria-label="Copy command" onClick={copy}>
              <Icon name={copied ? "check" : "copy"} strokeWidth={copied ? 2.2 : 2} />
            </button>
          </div>
          <a className="btn btn-ghost" href={`${REPO}#set-up-a-flags-repository-in-two-minutes`}>Read the quickstart<Icon name="arrow" /></a>
        </div>
        <p className="note"><Icon name="shield" />Nothing runs on our servers. Open source under the Functional Source License.</p>
      </div>
    </section>
  );
}
