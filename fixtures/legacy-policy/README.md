# Immutable legacy policy fixture

These three files were produced by the unmodified baseline runtime at
`1f6d31c45c4503b5099899b6a981de677aa7c809` from a newly recorded, own, deliberately
failing Playwright 1.63.0 `toContain` trace on Chromium 153.0.8010.12. All person
markers are fake canaries. Baseline report and verify returned exit 0 despite both
canaries being retained in JSON, HTML and the visible viewer.

This is an intentionally unsafe retained sample for regression/migration checks.
Keep its bytes/hashes unchanged. Current verify refuses its known policy 1 with
`legacy-policy-reduction-required` (exit 3). It is not shipped in the runtime tgz.
