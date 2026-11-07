import { GitHub, Icon } from "./Icons";
import { REPO } from "./Nav";

const POINTS = [
  "Unlimited flags, environments, and seats. There is no seat.",
  "Unlimited evaluations. Server SDKs evaluate locally and never call home.",
  "Your data never leaves your GitHub org and your Cloudflare account.",
  "No lock-in. The flags are JSON files you already have.",
];

export function Pricing() {
  return (
    <section id="pricing" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="center stack" style={{ marginBottom: 40 }}>
          <p className="eyebrow">Pricing</p>
          <h2 className="h2">You already pay for the infrastructure</h2>
        </div>
        <div className="price">
          <div>
            <p className="big">$0<small>from us</small></p>
            <p className="lead" style={{ marginTop: 16 }}>The engine is source-available under the Functional Source License and becomes Apache 2.0 two years after each release. The SDK, core, and CLI are MIT. The Worker runs in your Cloudflare account on the free tier or the $5 a month paid tier.</p>
            <div className="cta" style={{ justifyContent: "flex-start", marginTop: 24 }}>
              <a className="btn btn-dark" href={REPO}><GitHub />Get started on GitHub</a>
            </div>
          </div>
          <ul className="checks">
            {POINTS.map((p) => (
              <li key={p}><Icon name="check" strokeWidth={2.2} /><span>{p}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
