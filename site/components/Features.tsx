import { Icon } from "./Icons";

const FEATURES: Array<{ icon: "percent" | "users" | "tag" | "clock" | "key" | "gauge"; title: string; text: React.ReactNode }> = [
  { icon: "percent", title: "Percentage rollouts", text: <>Bucket by user id, account id, or any attribute you name. Sticky across deploys and across flags.</> },
  { icon: "users", title: "Segments", text: <>Name a group once in <code>segments/</code>, reference it from any rule. Beta testers, internal staff, a customer on a special plan.</> },
  { icon: "tag", title: "Semver targeting", text: <>Force an upgrade below <code>2.3.0</code>, or ship a feature only to builds that can handle it. Prerelease tags compare correctly.</> },
  { icon: "clock", title: "Expiry and ownership", text: <>Every flag can carry an owner and an expiry date. The weekly stale-flag issue makes cleanup someone&apos;s job.</> },
  { icon: "key", title: "Two kinds of keys", text: <>Server keys read the whole bundle. Client keys can only evaluate, only see flags marked <code>client: true</code>, and never learn a rule name.</> },
  { icon: "gauge", title: "Edge native", text: <>ETag caching, 304s for unchanged bundles, per-key rate limits on client traffic, and geo attributes filled in from Cloudflare when you don&apos;t send them.</> },
];

export function Features() {
  return (
    <section id="features">
      <div className="wrap">
        <div className="center stack" style={{ marginBottom: 40 }}>
          <p className="eyebrow">What&apos;s in the box</p>
          <h2 className="h2">Everything a flag system needs. Nothing it doesn&apos;t.</h2>
        </div>
        <div className="cards c3">
          {FEATURES.map((ft) => (
            <div className="card" key={ft.title}>
              <div className="ic"><Icon name={ft.icon} strokeWidth={1.6} /></div>
              <h3 className="h3">{ft.title}</h3>
              <p>{ft.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
