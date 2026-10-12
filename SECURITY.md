# Security policy

The experimental 0.1.x release supports only the documented adapter and policy.
Reduction is not a certificate of privacy. Unknown sensitive information may remain
in permitted error text; the caller must review it before sharing.

For a vulnerability, use this repository's private GitHub security advisory
reporting when available. Include a minimal synthetic reproducer, version, expected
behavior and observed exit code. Do not send credentials, real traces or literal
files. If private reporting is unavailable, open an issue requesting a private
reporting channel without sensitive details.

Known literal retention, false complete coverage, imported-code execution, input
mutation, unbounded parsing and untrusted path handling are release-blocking defects.
Third-party advisories and supported Playwright releases should be rechecked for each
release; v0.1.0 uses yauzl 3.4.0 and a lockfile. See docs/threat-model.md.
