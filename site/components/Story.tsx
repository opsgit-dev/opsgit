"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icons";

const P1 = "Your flags are in a vendor dashboard. Someone changes a rule at 4pm on a Friday. Nobody reviewed it, nothing in git shows it, and the bill went up again when you added two engineers.";
const PROBLEMS = [
  "Rules you can't diff, review, or roll back with git.",
  "Per-seat pricing for something that is ten lines of JSON.",
  "A vendor outage that becomes your outage.",
  "Targeting rules sent to every browser that asks.",
];
const P2 = "opsgit turns the flag into a file and the change into a pull request. Review, CI, history, and ownership come from GitHub. Delivery comes from a Worker in your own Cloudflare account.";
const P3 = "You keep the flags. We keep nothing.";

/** Every word is a span, so the block can light up as it scrolls through the 40% line (the reference does this per letter with GSAP). */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}><span className="w">{w}</span>{" "}</span>
      ))}
    </>
  );
}

export function Story() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = Array.from(el.querySelectorAll<HTMLElement>(".w"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((w) => w.classList.add("on"));
      return;
    }
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = el.getBoundingClientRect(), line = window.innerHeight * 0.4;
      const progress = Math.max(0, Math.min(1, (line - r.top) / r.height));
      const n = Math.floor(progress * words.length);
      words.forEach((w, i) => w.classList.toggle("on", i < n));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  return (
    <section>
      <div className="narrow reveal" ref={ref}>
        <p className="prose"><Words text={P1} /></p>
        <ul className="problems">
          {PROBLEMS.map((t) => (
            <li key={t}><Icon name="circle-x" /><span><Words text={t} /></span></li>
          ))}
        </ul>
        <p className="prose" style={{ marginTop: 36 }}><Words text={P2} /></p>
        <p className="prose muted"><Words text={P3} /></p>
      </div>
    </section>
  );
}
