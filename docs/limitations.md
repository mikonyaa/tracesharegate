# Limitations

- Only Playwright 1.63.0 / schema 9 is covered. A familiar version number alone does
  not authorize unknown schema extensions. Other versions produce unsupported diagnostics.
- A completed supported reduction means policy execution, not privacy. Retained
  bounded error text may include unknown sensitive information. Review it manually.
- Selectors, arguments/results, original titles, source, network values, expected /
  received assertion values, screenshots and DOM replay are deliberately lost.
  The original private Trace Viewer remains necessary for many deeper investigations.
- Images are omitted without OCR. Most resource/source/media bytes are never opened;
  declared sizes are not measurements. Corruption in discarded opaque payloads is
  not content-inspected; processed NDJSON CRC, size and syntax are checked.
- Lanes keep independent relative clocks. Cross-stream timing and `stepId` links are
  not inferred. Untimed errors show event indices, not synthesized timestamps.
- Browser-only traces do not establish runner assertion outcomes. Runner scope means
  recorded observations, not a claim about every assertion in the original test.
- Exact, JSON, URI and NFC literal variants are checked. Other base64/Unicode/encoding
  transformations and unknown sensitive values are not universally recognized.
- Very long error strings are omitted whole; remaining error context is limited.
  This can remove useful error details, and the viewer states when text is excluded.
- The HTML's downloadable omission snapshot contains the JSON hash only. Use the
  canonical sibling manifest for final JSON/HTML verification; embedding a final
  HTML hash inside the same HTML would be self-referential.
- Worker heap/time and parsing bounds intentionally reject some large valid traces.
  The heap budget is not a strict OS memory cap. v0.1.0 validates macOS arm64 locally
  and Ubuntu x64 in public CI; other platforms remain unconfirmed.
- npm registry publication, signing and attestations are not part of this release.
  No external user review or successful private debugging sessions are claimed.

P2 candidates: more released versions with separate fixtures/adapters, opt-in
fields only with concrete debugging evidence, more platform checks and npm
publication under an available controlled name. Replay sanitization, OCR, arbitrary
regex, cloud upload, AI redaction, HAR and rrweb adapters are outside v1.
