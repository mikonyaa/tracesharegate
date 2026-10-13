# Contributing

Use Node 22 or newer. Clone this repository into a separate working directory.

```sh
npm ci
npx playwright install chromium
npm run schemas:check
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:adversarial
npm run test:recorded
npm run test:trace-viewer
npm run test:ui
npm run test:package
npm run build:site
```

Only synthetic fixtures belong in this repository. Never add real traces,
credentials, literal files, browser profiles or raw local diagnostics. Keep local
literal files in ignored `local-policy/`. Do not attach production traces to issues.

A new adapter must cite a released tag and include real runner/assertion fixtures,
unknown-field cases, bounds and canary checks. A schema number alone is insufficient.
Keep unknown keys and archive filenames out of exported diagnostics. Changing the
allowlist or redaction rules requires a policy version/fingerprint review.

CI package and Pages uploads use explicit file allowlists. Published tags and
assets are immutable; corrections require a new version. Before submitting changes,
verify an installed final tarball in a clean consumer without development packages.

No external user validation is claimed for the local 0.1.1 candidate. Follow docs/independent-review-runbook.md after separate authorization. Fresh recordings/evidence go into ignored .work/output directories; never replace historical fixtures to conceal a regression.
