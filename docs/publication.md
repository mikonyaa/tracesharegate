# Verified 0.1.0 publication

Historical policy 1 record. This does not verify the local 0.1.1 candidate, and the known matcher-value gap remains in immutable old artifacts. No new publication is claimed.

- Repository: https://github.com/mikonyaa/tracesharegate (ID 1416146616).
- Release: https://github.com/mikonyaa/tracesharegate/releases/tag/v0.1.0.
- Release source commit: `9c88a2be964a772c9cf8666b0ac4ac4d44476fd3`.
- Release CI: https://github.com/mikonyaa/tracesharegate/actions/runs/38310948028,
  push/main at the exact release SHA. Node 22 and 24 jobs both executed all 14
  mandatory steps successfully, including recording, reduction, browser QA and
  final package consumption. The Node 24 job uploaded the exact tested assets.
- Pages: https://mikonyaa.github.io/tracesharegate/; actual deployment run
  https://github.com/mikonyaa/tracesharegate/actions/runs/38311061706.
- Tarball: 371,306 bytes; SHA-256
  `56ed585522d9092faf12d81007a9f9dabfa738a719bd7648ab874071f9be2d1e`.
- Browser recorded/tested in CI: Chromium 153.0.8010.12 with Playwright 1.63.0,
  trace schema 9; build Node 24.21.0 / Linux x64.

The annotated tag peels to the release source commit. CI assets were downloaded,
checked, consumed on macOS arm64, uploaded to a draft, downloaded again and compared
byte for byte, then published. No tarball was repacked after selection.

The first CI run failed because a fresh checkout lacked an owned screenshot
output directory. The test now creates it itself; no tests were disabled. The
successful release run covers that corrected source commit.

Anonymous post-publication QA read the public repo, README, LICENSE and code,
downloaded every asset without authorization/cookies, validated archive format,
size, SHA256SUMS and manifest, installed the public tgz in a new consumer, and ran
doctor/demo/report/verify. The actual packaged assertion fixture produced 33
actions and 3 errors, zero canary matches and an unchanged input fingerprint.
No development dependencies/browser were installed; processing ran with network
and child-process APIs blocked. Verification without literals explicitly returned
`not-performed`; passing the local file returned `performed`.

The published example's JSON/HTML/manifest were verified and matched the live Pages
bytes. Live controls passed at 1440 and 390 pixels, with hard refresh, search,
status filtering, copy and omission download, no horizontal overflow, imported
source leakage or external requests. Local browser QA also covers 1024 pixels,
file:// offline, empty/unknown results, long errors, imported markup and 5,000 actions.
See [public results](evidence/public-results.json) and [release CI proof](evidence/release-ci.json).

Pages is pinned to the selected release source/CI artifact. Documentation CI runs
leave that released example in place. A future release must deliberately update
that selection after its own gates; no DNS, CNAME or root user-site changes are used.
Subsequent publication/QA documentation commits on main are separate from the
release source commit and do not change the immutable Release assets.

Reproduce anonymous checks from the checkout with development/browser dependencies:

```sh
node --import tsx scripts/public-qa.mjs
```

This records technical observations on synthetic data, not external user feedback,
independent privacy certification or a universal compatibility claim.
