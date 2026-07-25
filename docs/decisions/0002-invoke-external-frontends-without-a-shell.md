# 0002: Invoke external frontends without a command shell

- Status: Accepted
- Date: 2026-07-25

## Context

The external frontend protocol must support implementations in any language while treating
grammar files as untrusted input. The CLI option was originally described as accepting a
command, which could imply shell parsing. Shell interpretation would make quoting
platform-dependent and turn an executable selection into an injection surface.

File paths also need to remain distinct arguments so frontends can receive split grammars
without reconstructing an ambiguous command line.

## Decision

Interpret `--frontend-cmd` as one executable path, despite its historical option name.
Start it directly with `shell: false` and pass protocol arguments as a separate array.
Do not parse embedded arguments or invoke a shell. Implementations that require an
interpreter or fixed flags use a small wrapper executable.

Pass source paths in CLI order for the normal form. Use `parse --stdin` only when the CLI
input is `-`. Validate stdout as JSON, then against the Grammar IR schema and canonical
rules before analysis.

## Consequences

- Grammar paths and dialect values cannot alter the executed command.
- Invocation behaves consistently across shells and avoids defining a second quoting
  language.
- A Python or other interpreted frontend needs an executable shebang or wrapper.
- The existing option name is slightly broader than its accepted value; the protocol
  documentation explicitly defines the narrower contract.
