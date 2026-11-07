const STATS: Array<[string, string]> = [
  ["0", "databases, KV stores, or cold reads. Flags are compiled into the Worker bundle."],
  ["1", "workflow file in your repo. Everything else lives in the public action."],
  ["~30s", "from opening a pull request to a preview comment on it."],
  ["$0", "on top of your Cloudflare bill. The free Workers tier covers 100k requests a day."],
];

export function Stats() {
  return (
    <section style={{ paddingTop: 0 }}>
      <div className="wrap stats">
        {STATS.map(([n, t]) => (
          <div className="stat" key={n}><b>{n}</b><span>{t}</span></div>
        ))}
      </div>
    </section>
  );
}
