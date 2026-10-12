# Existing tools and one measured sample

On 2026-10-13 we read code, README and licenses for:

- **pw-sanitizer 0.5.0**, [commit 9176595](https://github.com/4M01/pw-sanitizer/tree/91765956ddd8d8622c15b8e6559adc7efdf2689e).
  It already handles genuine before/after trace streams, HTML trace copies,
  reporter timing, configurable step removal and screenshot handling via optional
  sharp. Its package declares MIT; no standalone LICENSE file was found at the
  inspected commit. No implementation code was copied.
- **playwright-redactor**, [commit a7f06ae](https://github.com/ryanrosello-og/playwright-redactor/tree/a7f06ae6fa6f1c4d8375ecc72bbdab6173c10bb6),
  an existing regex/environment-value trace redaction preparation tool with an MIT
  LICENSE file. No code or fixture media was copied.
- **Playwright's native Trace Viewer**, the full local replay/debugging tool,
  with [released recorder/types](format-support.md) under Apache-2.0.

We ran the closest tool, pw-sanitizer, on the exact same own synthetic assertion
ZIP. Configuration: one explicit synthetic-canary valuePattern, copy mode,
screenshot redaction disabled. The result applied 35 redactions and retained a
trace ZIP containing DOM events, a source entry, images/attachments and network
streams. Exact sizes and counts are in [measured JSON](evidence/baseline-comparison.json).
This configuration does not claim to exercise every available feature.

TraceShareGate derived a real timeline with the failing assertion and its sanitized
explanation, without embedded source/image/resource payloads. Its useful difference
is the intentionally small allowlist plus entry dispositions, declared/processed
byte distinction, semantic reference counts and explicit unknown coverage.

The cost is substantial lost context: selectors, expected/received values, DOM
replay, images, network details, source, original titles and globally aligned times.
Use the original privately when those details matter. This single synthetic sample
is not a universal security, compatibility or performance benchmark. Regex
replacement, trace sanitization and HTML reporting were not invented here.
