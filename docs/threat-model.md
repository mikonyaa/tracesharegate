# Threat model

Input ZIPs, NDJSON, error text and verification artifacts are untrusted. They may
contain sensitive values, hostile paths, oversized/deep JSON, duplicate calls,
unsupported versions, HTML/script text or decompression bombs.

The local tool never extracts entries, evaluates imported source/args/selectors,
merges untrusted options, uploads data or fetches remote modules. Only three output
files are written into a new reserved directory. Source bytes are read through an
owned bounded in-memory snapshot; file identity, size, nanosecond mtime/ctime and
SHA-256 are checked before/after reading. Snapshots are not uploaded or saved as
private CI artifacts. Existing outputs and input paths are refused.

Limits: 100 MiB input, 256 MiB processed decompressed streams, 20,000 entries,
200,000 events, 512 KiB NDJSON lines, 32 levels, 40,000 JSON nodes per line,
2,048 object keys, 20,000 array items per line, 50,000 actions, 10,000 errors,
128 streams, 200,000 resource references and 64 MiB per output artifact.
The CLI runs processing/verification in a worker with a 256 MiB old-generation heap
budget, 32 MiB young generation, 4 MiB stack and a parent-controlled 30-second timeout.
This is a JavaScript heap budget, not a strict OS RSS cap; Buffers/native allocations
also consume memory. Bounds may reject large valid traces; rejection is explicit.

ZIP reading uses lazy yauzl 3.4.0, not a custom parser. Traversal, absolute/drive
paths, NUL/control/backslash separators, case/NFC collisions, duplicates, encryption
and compression other than stored/deflate are refused. Processed streams check
actual decompressed bytes, declared size, UTF-8 and CRC32. Omitted opaque payloads
are not decompressed or CRC/content inspected; their metadata never becomes a
claim of content integrity. Unknown envelopes lower coverage. Partial results do
not quietly truncate or imply completed operations.

JSON validation is iterative and bounded. Prototype keys remain inert JSON data;
no object spread/assign imports them into options. HTML uses textContent, escaped
embedded JSON and a restrictive CSP with trusted script/style hashes. No remote
assets, local storage, uploads or telemetry are present. Verification reconstructs
the packaged renderer; it never executes arbitrary HTML.

Built-in patterns are bounded and not user-defined regex. Local literal files are
bounded, not copied or logged. Pattern coverage is intentionally limited; error
text can still contain unknown sensitive data. Human review remains mandatory.

The release checked the [yauzl advisory](https://github.com/advisories/GHSA-gmq8-994r-jv83)
(CVE-2026-31988, affected 3.2.0, fixed 3.2.1) and uses 3.4.0. The locked runtime
npm audit reported zero known advisories at validation time. That observation can
change; it is not a guarantee against vulnerabilities.

Out of scope: hostile OS administrators, authenticity of supplied hashes, racing
attackers controlling the output parent directory, guaranteed recognition of PII,
OCR, every encoding transform, replay sanitization, and multi-version compatibility.
