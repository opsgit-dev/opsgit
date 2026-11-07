import { Icon, Mark } from "./Icons";

export function PullRequest() {
  return (
    <section style={{ paddingTop: 0 }}>
      <div className="wrap split">
        <div>
          <p className="eyebrow">The pull request</p>
          <h3>A flag change reads like a flag change</h3>
          <p className="lead">The preview comment is written for the reviewer, not the machine. Enabled or not, who it targets, what percentage, and whether anything expires. If a fixture fails, the check fails.</p>
          <div className="facts">
            <div><h4>Deterministic rollouts</h4><p>A user bucketed in at 25% stays in at 50%. Hashing is MurmurHash3 over the flag key and user id.</p></div>
            <div><h4>First match wins</h4><p>Rules are evaluated top to bottom, conditions are ANDed. The comment tells you which rule a test user hit.</p></div>
            <div><h4>Fixtures</h4><p>Files in <code>tests/</code> pin an expected value for a context. They run on every PR.</p></div>
            <div><h4>Stale flags</h4><p>A weekly issue lists flags past their expiry or untouched for 90 days, with the owner tagged.</p></div>
          </div>
        </div>
        <div className="panel">
          <div className="bar"><Icon name="pr" /><b>Widen checkout rollout to 50%</b> · flags/new_checkout_v2.json</div>
          <div className="diff">
            <div className="ctx">{'  "rules": [{'}</div>
            <div className="ctx">{'    "name": "north-america-50pct",'}</div>
            <div className="ctx">{'    "conditions": [{ "attribute": "country", "operator": "in",'}</div>
            <div className="del">{'-      "value": ["US", "CA"] }],'}</div>
            <div className="add">{'+      "value": ["US", "CA", "GB"] }],'}</div>
            <div className="del">{'-    "rollout": 25,'}</div>
            <div className="add">{'+    "rollout": 50,'}</div>
            <div className="ctx">{'    "value": true'}</div>
          </div>
          <div className="comment">
            <div className="who"><i><Mark /></i>opsgit flags preview</div>
            <div className="tw">
              <table>
                <tbody>
                  <tr><td>new_checkout_v2</td><td>rule north-america-50pct</td><td></td></tr>
                  <tr><td>country</td><td>US, CA → US, CA, GB</td><td></td></tr>
                  <tr><td>rollout</td><td>25% → 50%</td><td className="warn">widens exposure</td></tr>
                  <tr><td>fixtures</td><td>8 passed, 0 failed</td><td></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
