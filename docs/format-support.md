# Supported released format

v0.1.0 supports exactly Playwright **1.63.0**, trace schema **9**, JavaScript/TypeScript
runner/library Chromium fixtures. The released tag peels to
`1b025d7e20a026371cd5f98ba0cdce48892737c8`.

Pinned primary sources:

- [Released traceV9 types](https://github.com/microsoft/playwright/blob/v1.63.0/packages/isomorphic/trace/versions/traceV9.ts)
- [Browser recorder](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/trace/recorder/tracing.ts)
- [Test runner recorder](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright/src/worker/testTracing.ts)
- [HAR resource pointer types](https://github.com/microsoft/playwright/blob/v1.63.0/packages/isomorphic/trace/versions/har.ts)
- [Source commit](https://github.com/microsoft/playwright/commit/1b025d7e20a026371cd5f98ba0cdce48892737c8)

The installed npm recorder and actual archives both emit version 9. Current main
and unreleased versions are not adapter inputs. No nearest-version guessing occurs.

Recognized event kinds: `context-options`, `before`, `after`, `action`, `input`,
`log`, `event`, `console`, `resource-snapshot`, `frame-snapshot`, `screencast-frame`,
`video`, `screenshot`, `aria-snapshot`, `stdout`, `stderr`, `error`.
The `action` complete-event shape exists in this released type family; a dedicated
adapter test covers it, while genuine fixtures primarily use before/after pairs.

Runner actions have `class: Test` and methods including `expect`, `test.step`,
`pw:api`, `fixture`, `hook`, and `test.attach`. Browser operations use an explicit
class/method table. Arbitrary names are never displayed. `before`/`after` matching
uses each trace stream plus call ID, so different contexts cannot collide. Every
stream gets its own lane. Same-lane parents require ordering and time containment;
no cross-stream parent or clock alignment is inferred. Error events without a time
keep their line/event index. Resource links in schema 9 use `_file`, not older
schema `_sha1` fields.

Known entry families: `test.trace`, `trace.trace`, numbered `*-trace.trace`, their
network/stacks companions, `src/`, `screencast/`, `screenshots/`, `aria/`,
`attachments/` and `resources/`. Unknown entry names become ordinal diagnostic IDs.
Streams require their own first `context-options` event and the exact supported
Playwright version. Networks require a confirmed companion stream.

## Genuine recording

`npm run test:recorded` creates a fresh owned temporary project and localhost app,
uses a single Test runner worker, trace `on`, screenshots/snapshots/sources/attachments
enabled, and verifies all three failures and their expected error causes. It then
copies only the four named synthetic ZIPs into fixtures. No ordinary browser profile
is used. The process closes only its own server/browser.

Assertion failure uses `expect(...).toHaveText`, element timeout uses a missing
button click, and navigation error uses a localhost connection deliberately closed
by the owned server. A successful prior assertion checks the visible Unicode canary
before the PNG capture. The original is also opened in the genuine released Trace
Viewer; snapshot, action and runner-error observations are recorded in evidence.

A browser-only fixture uses context.tracing; it cannot establish runner assertions.
See [Playwright tracing documentation](https://playwright.dev/docs/api/class-tracing).
The source fixture, capture options, version and hashes are recorded under
`fixtures/provenance/`. The six-surface canary test inspects actual archive data;
PNG presence/signature and manual visible-text inspection are distinct from text scanning.
