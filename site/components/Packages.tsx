import { Icon } from "./Icons";

const FLAG_JSON = `{
  <span class="k">"key"</span>: <span class="s">"new_checkout_v2"</span>,
  <span class="k">"enabled"</span>: <span class="n">true</span>,
  <span class="k">"default"</span>: <span class="n">false</span>,
  <span class="k">"owner"</span>: <span class="s">"@payments"</span>,
  <span class="k">"expires"</span>: <span class="s">"2027-03-01"</span>,
  <span class="k">"rules"</span>: [{
    <span class="k">"name"</span>: <span class="s">"north-america-50pct"</span>,
    <span class="k">"conditions"</span>: [
      { <span class="k">"attribute"</span>: <span class="s">"country"</span>, <span class="k">"operator"</span>: <span class="s">"in"</span>, <span class="k">"value"</span>: [<span class="s">"US"</span>, <span class="s">"CA"</span>] },
      { <span class="k">"segment"</span>: <span class="s">"beta_testers"</span> }
    ],
    <span class="k">"rollout"</span>: <span class="n">50</span>,
    <span class="k">"value"</span>: <span class="n">true</span>
  }]
}`;

const SERVER_TS = `<span class="c">// servers: download once, evaluate in-process</span>
<span class="k">import</span> { FlagsClient } <span class="k">from</span> <span class="s">"@opsgit/flags-sdk"</span>;

<span class="k">const</span> flags = <span class="k">await</span> FlagsClient.init({
  url: <span class="s">"https://flags.example.workers.dev"</span>,
  apiKey: process.env.FLAGS_SERVER_KEY,
});

<span class="k">if</span> (flags.isEnabled(<span class="s">"new_checkout_v2"</span>, { user_id, country })) {
  <span class="k">return</span> renderNewCheckout();
}

<span class="c">// the reason is always available</span>
flags.evaluation(<span class="s">"new_checkout_v2"</span>, ctx);
<span class="c">// → { value: true, reason: "RULE_MATCH", rule: "north-america-50pct" }</span>`;

const PKGS: Array<{ icon: "terminal" | "package" | "zap"; name: string; text: React.ReactNode; cmd: string; npm: string }> = [
  { icon: "terminal", name: "opsgit-flags", text: <>The command line. <code>init</code>, <code>create</code>, <code>validate</code>, <code>check</code>, <code>diff</code>, <code>explain</code>, <code>stale</code>, <code>preview</code>, <code>build</code>.</>, cmd: "npx opsgit-flags init", npm: "opsgit-flags" },
  { icon: "package", name: "@opsgit/flags-sdk", text: <>Polling client for servers, remote client for browsers and apps. Typed, tiny, with ETag revalidation built in.</>, cmd: "npm i @opsgit/flags-sdk", npm: "@opsgit/flags-sdk" },
  { icon: "zap", name: "@opsgit/core", text: <>The evaluation engine on its own. Give it a flag and a context, get a value and the reason. Use it in tests and build steps.</>, cmd: "npm i @opsgit/core", npm: "@opsgit/core" },
];

export function Packages() {
  return (
    <section id="packages" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="center stack" style={{ marginBottom: 40 }}>
          <p className="eyebrow">Packages</p>
          <h2 className="h2">Three small packages, all MIT</h2>
          <p className="lead">Zero runtime dependencies. Node, Bun, Deno, browsers, and Workers.</p>
        </div>
        <div className="cards c3">
          {PKGS.map((p) => (
            <div className="card" key={p.name}>
              <div className="ic tight"><Icon name={p.icon} strokeWidth={1.6} /></div>
              <h3 className="h3">{p.name}</h3>
              <p>{p.text}</p>
              <pre>{p.cmd}</pre>
              <a className="tag" href={`https://www.npmjs.com/package/${p.npm}`}>npm · {p.npm}</a>
            </div>
          ))}
        </div>
        <div className="codes">
          <pre className="code"><div className="t">flags/new_checkout_v2.json</div><span dangerouslySetInnerHTML={{ __html: FLAG_JSON }} /></pre>
          <pre className="code"><div className="t">server.ts</div><span dangerouslySetInnerHTML={{ __html: SERVER_TS }} /></pre>
        </div>
      </div>
    </section>
  );
}
