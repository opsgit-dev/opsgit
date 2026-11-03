# @opsgit/core

The evaluation engine behind [opsgit flags](https://github.com/pysavantcodes/opsgit). Give it a flag definition and a context, get back a value and the reason for it. No network, no dependencies, works in Node, browsers, Workers, Bun and Deno.

You usually want `@opsgit/flags-sdk` instead, which fetches flags from your deployed worker and calls this under the hood. Reach for `@opsgit/core` directly when you already have the flag JSON in hand, for example in tests or a build step.

```sh
npm install @opsgit/core
```

## Evaluate a flag

```js
import { evaluate } from "@opsgit/core";

const flag = {
  key: "new_checkout",
  enabled: true,
  default: false,
  rules: [
    {
      name: "canada-half",
      conditions: [{ attribute: "country", operator: "eq", value: "CA" }],
      rollout: 50,
      value: true,
    },
  ],
};

evaluate(flag, { country: "CA", user_id: "u_42" });
// { key: "new_checkout", value: true, reason: "RULE_MATCH", rule: "canada-half" }

evaluate(flag, { country: "DE" });
// { key: "new_checkout", value: false, reason: "DEFAULT" }
```

`reason` is one of `RULE_MATCH`, `DEFAULT` or `FLAG_DISABLED`.

Rules run top to bottom and the first match wins. Conditions inside a rule are ANDed. A `rollout` below 100 buckets the context by `user_id` (or whatever `bucket_by` names) with a stable hash, so the same user lands on the same side every time, and a context with no bucketing attribute never enters a partial rollout.

## Evaluate everything at once

```js
import { evaluateAll } from "@opsgit/core";

const results = evaluateAll(bundle, { user_id: "u_42", plan: "pro" });
results.new_checkout.value; // true
```

A bundle is what the worker serves from `GET /v1/flags`: `{ version, etag, generated_at, flags, segments }`.

## Segments

A rule condition can be `{ "segment": "beta_testers" }`. Pass the segments map as the third argument and the segment's conditions are checked in place:

```js
evaluate(flag, context, bundle.segments);
```

## Operators

`eq` `neq` `in` `not_in` `contains` `starts_with` `ends_with` `gt` `gte` `lt` `lte` `semver_eq` `semver_gt` `semver_gte` `semver_lt` `semver_lte` `exists`

Numbers and numeric strings compare equal, since context often arrives as strings from headers or query params. A missing attribute never matches anything, including `neq` and `not_in`. The semver operators follow semver precedence, so `2.3.0-beta.1` sorts below `2.3.0`.

## Validate a flag file

```js
import { validateFlag } from "@opsgit/core";

const problems = validateFlag(json, { fileName: "new_checkout.json" });
// [] when valid, otherwise strings like
// 'rules[0].conditions[0].value: "in" needs a non-empty array of strings, numbers or booleans'
```

`validateSegment` does the same for segment files. Both catch unknown fields, so a typo like `defualt` fails instead of being silently ignored.

## Also exported

`matchRule`, `matchCondition`, `bucket` (the 0 to 100 rollout bucket for a flag key and user), `parseSemver`, `compareSemver`, and the TypeScript types for flags, rules, conditions, bundles and evaluations.

MIT.
