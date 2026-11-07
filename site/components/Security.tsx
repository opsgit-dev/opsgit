import { Icon } from "./Icons";

const CHECKS: React.ReactNode[] = [
  <>Flags are server-only unless you opt them in with <code>client: true</code>.</>,
  <>Keys are stored hashed and compared in constant time.</>,
  <>Client traffic is rate limited per key and IP at the data centre.</>,
  <>Request bodies are capped and contexts are scalar-only.</>,
  <>The GitHub Action is pinned to commit hashes, and so are its own dependencies.</>,
];

export function Security() {
  return (
    <section id="security">
      <div className="wrap split">
        <div className="panel" style={{ order: 2 }}>
          <div className="bar"><Icon name="shield" /><b>Live from the demo Worker</b> · client key</div>
          <div className="diff">
            <div className="ctx">POST /v1/evaluate  flag_key=api_rate_limit</div>
            <div className="del">404  not visible to client keys</div>
            <div className="ctx">GET  /v1/flags</div>
            <div className="del">403  server keys only</div>
            <div className="ctx">POST /v1/evaluate  flag_key=example_banner</div>
            <div className="add">{'200  { value: {…}, reason: "RULE_MATCH" }   no rule name'}</div>
            <div className="ctx">GET  /v1/flags  (no key)</div>
            <div className="del">401</div>
          </div>
        </div>
        <div style={{ order: 1 }}>
          <p className="eyebrow">Security</p>
          <h3>Your targeting rules are yours</h3>
          <p className="lead">Most flag services hand the full rule set to every browser that asks. opsgit splits keys by role so that the public side of your app can only ask one question: what is the value for this user.</p>
          <ul className="checks" style={{ marginTop: 28 }}>
            {CHECKS.map((c, i) => (
              <li key={i}><Icon name="check" strokeWidth={2.2} /><span>{c}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
