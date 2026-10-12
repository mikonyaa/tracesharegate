# Maintenance

For each release, check official Playwright release tags and actual recorder output,
ZIP/runtime advisories, lockfile audit and full unit/adversarial/recorded/browser /
package-consumer gates. A format change needs independent fixtures and an adapter;
do not guess compatibility by schema number. Every new retained field needs a
policy and leakage review. Every named redaction rule needs bounded behavior tests.

Release source commits, CI event/head SHA, exact tested package bytes and anonymous
post-download consumer checks must be recorded. Upload only explicit synthetic
assets. Never repack after selecting a tested CI tarball, move public tags, force
push or silently replace published assets. Release corrections use a new version.

The maintainers make no universal sanitization or independent audit claim. Report
release-blocking regressions through SECURITY.md using a synthetic reproducer.
