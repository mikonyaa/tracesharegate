# minimal-v1 policy version 2 and coverage

The policy is versioned code and a JSON Schema, not an executable user config.
Its SHA-256 fingerprint covers its ID, version, retained/omitted categories and
built-in rule definitions, operation mapping and string/literal scope. Changes to rule implementation require a tool release and policy
review. Known policy 1 is explicitly refused with legacy-policy-reduction-required; other unknown policy versions/fingerprints cannot pass policy verification. See [migration](migration-0.1.1.md).

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

Error names/messages are bounded to 8 KiB of UTF8 both before and after replacements.
The adapter normalizes ANSI/bidi/control formatting, recognizes fixed matcher
headers and diagnostic envelopes from the pinned Playwright helpers, and omits
expected/received values, complete multiline continuations and prefixed diffs.
Only closed quoted values or strict JSON containers establish a value boundary;
Symbol and regex-bearing pretty containers are excluded with unknown coverage.
Known single-line custom-message prefixes and matcher receiver arguments are omitted.
No person/project canary value is hardcoded in built-in patterns.

A Locator description can contain arbitrary raw newlines. The complete body from
`Locator:` onward is excluded and reported as `unknown-error-context`; the known
matcher heading stays useful. No timeout/call-log/source-looking line inside that
body is promoted to a trusted diagnostic. Unknown headers, receiver envelopes and
continuations are excluded, never guessed safe. More than 128 diagnostic lines or
excessive final bytes yields `error-context-limit` and incomplete coverage. At most
eight diagnostic lines can be retained; ordinary single-line errors plus source/log
omission remain supported. This does not classify arbitrary retained plain error
text as private-data-free.

Whole URL/path spans, longest-first literal variants and bounded built-ins apply to
retained text before serialization/HTML escaping. The final envelope must remain
recheckable after sanitization; otherwise it is excluded with incomplete coverage.
Reason rows record fixed rule IDs and field paths without values or per-secret
hashes. Error block counts count discarded lines (including opaque tail lines);
`error-context-limit` counts omitted messages and `oversize-string` counts fields.
Formatting/literal rows count replacements. The aggregate `error-context` count is
omission accounting, not the count of distinct sensitive values.

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
without executing supplied text. Known legacy policy fails explicitly; unknown policies fail. Current verification rechecks retained error context even if the supplied hashes and HTML were coherently rebuilt. A supplied literal file is
required to rerun local literal checks; no hidden cache exists. Previously recorded
redaction counts are history, not fresh checks. Hashes establish consistency, not
authenticity, authorship or privacy.
