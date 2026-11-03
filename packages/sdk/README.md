# @opsgit/flags-sdk

Client for [opsgit flags](https://github.com/opsgit-dev/opsgit), a feature flag setup where flags live as JSON files in a Git repo and get deployed to a Cloudflare Worker on your own account.

There are two clients. Pick by where the code runs.

```sh
npm install @opsgit/flags-sdk
```

## On a server

`FlagsClient` downloads the whole flag bundle once, keeps it in memory, and re-checks every 30 seconds using an ETag, so an unchanged bundle costs a single small 304. Evaluating a flag never touches the network.

```js
import { FlagsClient } from "@opsgit/flags-sdk";

const flags = await FlagsClient.init({
  baseUrl: "https://my-flags.example.workers.dev",
  apiKey: process.env.FLAGS_SERVER_KEY,
});

app.get("/checkout", (req, res) => {
  const ctx = { user_id: req.user.id, country: req.user.country, plan: req.user.plan };

  if (flags.isEnabled("new_checkout", ctx)) {
    return res.render("checkout-v2");
  }
  res.render("checkout");
});
```

Other things you can ask it:

```js
flags.get("api_rate_limit", ctx, 100);   // the value, or 100 if the flag doesn't exist
flags.evaluation("new_checkout", ctx);   // { key, value, reason, rule } or undefined
flags.all(ctx);                          // every flag evaluated for this context
flags.etag;                              // which bundle version is loaded
await flags.refresh();                   // check for a new bundle right now
flags.close();                           // stop polling, e.g. on shutdown
```

Options for `init`:

| option | default | |
| --- | --- | --- |
| `pollIntervalMs` | `30000` | how often to revalidate. `0` disables polling. |
| `onUpdate(bundle)` | | called when a new bundle has loaded |
| `onError(err)` | | called when a refresh fails. The last good bundle keeps serving. |
| `fetch` | global | bring your own fetch, handy in tests |

`init` throws if the first fetch fails, so a bad URL or key shows up at startup rather than as silently-default flags later.

The key you pass here is a *server* key. It can read your targeting rules, so keep it out of browsers.

## In a browser or mobile app

`RemoteFlagsClient` sends the context to the edge and gets evaluated values back. Rules never leave the server, and the key it uses is a *client* key that can only evaluate.

```js
import { RemoteFlagsClient } from "@opsgit/flags-sdk";

const flags = new RemoteFlagsClient({
  baseUrl: "https://my-flags.example.workers.dev",
  apiKey: "ck_...",
});

const { flags: values } = await flags.evaluateAll({ user_id, environment: "production" });

if (values.new_checkout.value === true) {
  showNewCheckout();
}
```

Call `evaluateAll` once per session and keep the result. There's also `evaluate(key, context)` for a single flag.

Client keys only see flags that have `"client": true` in their JSON. Everything else is server-only and comes back as a 404, the same as a flag that doesn't exist. Responses to client keys also leave out the matching rule's name, so your targeting stays private.

## In tests

Skip the network entirely:

```js
const flags = FlagsClient.fromBundle({
  version: 1,
  etag: "test",
  generated_at: "",
  flags: {
    new_checkout: { key: "new_checkout", enabled: true, default: true },
  },
});
```

## Contexts

A context is a flat object of strings, numbers and booleans. Which attributes matter is up to your rules. Common ones are `user_id` (needed for percentage rollouts), `environment`, `country`, `plan` and `app_version`.

The worker fills in `country`, `region`, `city`, `continent`, `timezone`, `asn` and `colo` from the request when you don't send them. For server to server calls that's the location of your server, not your user, so send them explicitly.

## Types

Everything is typed. `Bundle`, `Flag`, `Context`, `Evaluation` and friends are re-exported from `@opsgit/core`, as are `evaluate` and `evaluateAll` if you want to evaluate a bundle you got some other way.

MIT.
