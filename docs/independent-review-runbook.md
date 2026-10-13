# Independent review of the local 0.1.1 candidate

This runbook is prepared for a separately authorized human review. Automated local
tests and a separate code-review agent are not evidence of an external user's
workflow or a privacy certification. No reviewer has been contacted.

## Reproducible local gates

Use a fresh checkout, Node 22+, the committed lockfile and default Chromium for
Playwright **1.63.0**. Do not use another person's active checkout or browser
profile. Install dependencies/browsers during setup; the reducer itself is offline.

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
npm run test:ui
npm run test:package
```

The recorder creates own traces in `.work/recorded-fixtures` and
`.work/matcher-fixtures`; it does not replace the historical committed ZIPs or
provenance. Runner exit **1** is intentional. The recorder verifies failure causes
and trace attachments; browser launch failures are rejected. Processing/verification
test runners must exit **0**.

`tests/recorded-traces/matcher.spec.ts` creates 20 independent cases with ordinary
person/project canaries and no secrets file. Default Chromium was recorded locally
as **153.0.8010.12**; record the actual version on the reviewer's platform.
Expected statuses are in each case's `provenance.json` row: 12 complete, 8 incomplete.
The three `have-text*` and five `opaque-*` cases are incomplete solely because of
`unknown-error-context`, not hidden unsupported operations. In particular, Symbol,
regex-bearing containers, raw locator descriptions and an unsupported receiver
envelope must not retain injected `Timeout: 7654321ms` or subsequent payloads.

## Independently inspect artifacts

Install the selected tgz with `--ignore-scripts --omit=dev` in a new directory.
Confirm Playwright/TypeScript/browser assets are absent from that runtime consumer.
With a copied own trace, run:

```sh
node --import /path/to/source/scripts/runtime-guard.mjs \
  node_modules/tracesharegate/dist/cli.js report own-trace.zip --out new-report --json
node --import /path/to/source/scripts/runtime-guard.mjs \
  node_modules/tracesharegate/dist/cli.js verify \
  --report new-report/report.json --manifest new-report/manifest.json \
  --html new-report/report.html --json
```

Use real local paths; do not put actual secret values in command arguments. Set
`TSG_RUNTIME_GUARD_DIR` to a new local directory to collect the guard's API-attempt
log. Every runtime main/worker record should be instrumented with zero denied
network/child attempts. The package gate separately proves the guard rejects
`spawnSync` and `fetch`; those intentional controls have exit 1 and separate logs.
Guard coverage is a tested API boundary, not OS-level isolation against hostile code.

Check expected status/exit codes case by case. Search the JSON, manifest and HTML
for all markers from the **original error**, independently of the reducer/parser.
Open the report through `file://` with the browser offline; view every error, search,
filter, navigate with the keyboard, copy the retained text and download the omission
snapshot. Inspect 390/1024/1440 widths, empty/unknown/error states and 5,000 actions.
Confirm there are no external requests or page errors, and no marker in visible
text, copied error text or the embedded data. Read the useful retained diagnosis.

Negative checks must reject modified JSON bytes, manifest references, HTML with
refreshed hashes, incorrect policy/fingerprint, malformed ZIP/CRC/UTF8, excessive
entry/output sizes and unknown error context. A coherently rebuilt bundle containing
an Expected/Received block must fail `error-context-postcondition` even when its
hashes and trusted HTML are correct. Test a known literal file separately; literals
matching tool-owned text may intentionally fail the literal postcondition.

Compare the immutable policy 1 fixture with policy 2. The old verifier's historical
exit 0 and visible value leak can be reproduced with the baseline runtime. The new
verifier must return `legacy-policy-reduction-required` without changing those files.
Only a separate re-reduction of the original trace gets policy 2 guarantees.

## Actual workflow review remains external

Use only the reviewer's own/authorized traces. Identify a real debugging question,
have a recipient inspect the retained report without the original, and record which
diagnosis was possible and which omitted context was needed. Inspect every retained
name/message manually. Record reviewer consent, versions, input/output hashes,
status, actual commands/exits and findings without publishing private traces or
literal files. Store private review evidence locally unless its owner authorizes
sharing. No source authenticity, universal secret absence, OCR/content audit of
opaque assets, production compatibility, 10/10 score or external success is assumed.
