# Local 0.1.1 candidate: policy version 2

The policy family ID remains `minimal-v1`; its version is now **2**, with a new
fingerprint covering the diagnostic grammar, bidi normalization and quantitative
limits. The report/manifest envelope stays at schema version 1. New reason/rule
IDs and error coverage paths are additive. Use the new validator for new reports;
the 0.1.0 validator does not understand these additions.

0.1.0 / policy 1 omitted only selected diagnostic lines. Real `toContain`, regex
and object/array diff failures could retain expected/received values while both
report and verify returned exit 0. That historical result is not a policy 2 check.

The new verifier schema-validates a known policy 1 bundle, then refuses it with
`legacy-policy-reduction-required` (exit 3). It does **not** claim fresh hash,
renderer or assertion checks for that bundle. Other policy/fingerprint mismatches
remain `unsupported-policy` (exit 3). Nothing rewrites an old report, manifest,
HTML, input hash or output hash. A schema-valid old artifact remains readable.

Re-reduce the original trace into a **new** directory with 0.1.1, inspect all
retained errors, and run verify on that separate bundle. Do not edit the old JSON
to change its version or fingerprint, or regenerate only its HTML. The old HTML
contains its original viewer and cannot acquire a new warning without changing
its bytes. A separate preview using the new renderer displays a legacy warning;
it is not a replacement verified bundle.

## Deliberate status changes

Expected/received blocks, closed multiline strings, strict JSON value containers
and prefixed diffs are excluded. A single-line `Error: <custom message>` preceding
a known matcher heading is excluded too. Known matcher receiver validation errors
retain only a generated `toHaveText: invalid receiver type`-style diagnosis.

Unknown matcher hints, unsupported value formats (including Symbol/regex-bearing
pretty containers), plural/unknown receiver envelopes and unknown continuations
are excluded with `unknown-error-context`. Size/line overflow is excluded with
`error-context-limit`; the UTF8 byte limit applies both before and after literal
replacement to error names and messages.

**Locator error bodies are conservatively incomplete.** Playwright's
`Locator.describe()` permits arbitrary raw newlines. A description can imitate
`Timeout:`, call logs or stack frames, even after a canonical-looking first line.
There is no trusted boundary metadata in the runner error string. The reducer
keeps the known matcher/failed heading and excludes the entire tail beginning at
`Locator:` with `error-locator-context` and `unknown-error-context` (exit 3).
Ordinary `toHaveText` errors, the packaged assertion demo and historical fixtures
therefore become incomplete under policy 2. This is diagnostic coverage lost on
purpose; the failure outcome and source event references remain.

`verify` can return exit 0 for a consistent **incomplete** new bundle; its returned
`processingStatus` still says incomplete. That does not upgrade coverage. New
successful checks report `policyVersion: 2` and `assertionContextRecheck: performed`.
Both writer and verifier enforce the retained error-context postcondition.

No published 0.1.0 artifacts are replaced, and this candidate is not published.
Always review the retained copy. Neither version guarantees absence of arbitrary
sensitive information, source authenticity, or inspection of opaque omitted assets.
