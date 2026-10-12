# minimal-v1 policy and coverage

The policy is versioned code and a JSON Schema, not an executable user config.
Its SHA-256 fingerprint covers its ID, version, retained/omitted categories and
built-in rule definitions, operation mapping and string/literal scope. Changes to rule implementation require a tool release and policy
review. Unknown policy versions/fingerprints cannot pass policy verification.

Only local IDs, known operation labels, stream-relative times, outcomes, proved
parents, bounded redacted errors, counts and coverage enter the report. All other
trace payloads are excluded. Unknown class/method strings get `Unknown operation`;
raw imported titles, IDs, names or schema keys never become diagnostics.

## Four different kinds of accounting

1. **Archive inventory:** physical central-directory entries; each entry counted
   once. `declaredUncompressedBytes` comes from ZIP metadata. It is not a measured
   decompressed size. Only processed trace/network streams have
   `actualProcessedBytes` and `contentsInspected=true`.
2. **Recognized schema:** released event envelopes and retained structures are
   known. Unknown top-level keys/kinds, unsupported retained shapes, inconsistent
   metadata and unknown entry categories lower coverage. Known excluded opaque
   containers (params/results/options, snapshots/HAR, console payloads, attachments
   and stacks) are bounded but their arbitrary user keys are not interpreted.
3. **Processed retained fields:** every supported retained field was passed through
   policy, timeline reconstruction and redaction. Unfinished/duplicate/orphan calls,
   invalid times and unproved parents keep unknown/incomplete outcomes.
4. **Pattern matching:** named bounded rules matched permitted strings. Exact,
   JSON-escaped, URI-encoded and NFC literal variants are supported. Unknown
   encodings and unknown sensitive values remain outside that assertion.

None of these proves absence of sensitive information in all original data.
`omitted` does not mean scanned and safe. Images are discarded without OCR.

Physical entries and semantic uses are separate: a resource can have several
references and categories; its bytes are not counted again for each use. No resource
payload or per-secret guessed hash is stored. Resource links use ordinal entry IDs.
Duplicate content under different names remains two physical entries. Identical or
normalization-conflicting names are rejected.

## Error text and redaction

Errors over 8 KiB are omitted whole before truncation. The pipeline parses JSON,
selects permitted strings, masks whole URL/path spans, processes longest-first
literal variants, applies named built-ins, and finally serializes/escapes HTML.
Selectors, expected/received values, call-log payloads, stack/code-frame sections are
removed; at most eight remaining diagnostic lines are retained. Replacements use
stable markers. Summary rows contain a rule ID, fixed field path and replacement
count, never values or hashes of individual literals.

Final retained data and JSON/HTML/manifest bytes are rechecked. A known-literal or
built-in postcondition failure prevents publication of a finished output directory.
A literal matching a tool-owned string/marker can fail the postcondition too;
there is no silent weakening of the check.

## Manifest and verification

The final manifest records entries, known categories, dispositions, reasons,
declared/actual bytes, retained paths, redaction counts, unsupported structures,
parser/policy versions, input fingerprint and final report JSON/HTML hashes.
It never hashes itself. The offline HTML exports an embedded omission snapshot
with the JSON hash; the canonical sibling manifest contains the HTML hash too.

`verify` reads bounded untrusted artifacts, validates schemas and relationships,
compares policy/report/manifest data, checks bytes and reconstructs the trusted HTML
without executing supplied text. Unknown policies fail. A supplied literal file is
required to rerun local literal checks; no hidden cache exists. Previously recorded
redaction counts are history, not fresh checks. Hashes establish consistency, not
authenticity, authorship or privacy.
