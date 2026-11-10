# Security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/ydah/gramin/security/advisories/new)
for vulnerabilities, including unsafe code execution, unintended file access, or
an input that bypasses resource limits. Include the affected version, a minimal
input, the command or browser steps, and the observed impact. Keep exploit details
out of public issues until the report has been assessed.

Security fixes target the latest published release. Reports against `main` are
also welcome. Older releases may require an upgrade.

## Boundaries

Bundled frontends treat grammar actions and predicates as opaque source. They do
not execute target-language code. The browser sandbox performs analysis in a
terminable worker with input and time limits.

`--frontend-cmd` explicitly launches a program chosen by the caller; it requires
the same trust as running that executable directly. It is outside the no-source-
execution guarantee. The external frontend process has timeout and output limits,
and its output must pass Grammar IR validation.

Parsing and graph analysis still consume CPU and memory. Nesting and parameter
expansion limits do not impose a general bound on every analysis. Use process
isolation and a deadline when analyzing untrusted large inputs on a server.
