# Integration corpus

Small authored fixtures live in their frontend packages. Third-party grammars are not
vendored here. `scripts/fetch-corpus.sh` downloads exact upstream commits for local and
integration testing.

| Corpus | Upstream | License |
|---|---|---|
| GNU Bison examples | `akimd/bison` | GPL-3.0-or-later |
| Perl `perly.y` | `Perl/perl5` | Artistic-1.0-Perl OR GPL-1.0-or-later |
| Ruby `parse.y` | `ruby/ruby` | Ruby license / BSD-2-Clause |
| ANTLR grammars-v4 | `antlr/grammars-v4` | BSD-3-Clause |

Downloaded files remain subject to their upstream licenses.
