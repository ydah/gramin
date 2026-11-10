# Show HN submission draft

Title: Show HN: Gramin measures parser grammar structure and feature diffs

URL: https://ydah.github.io/gramin/

Submission text:

gramin turns Yacc/Bison/Lrama, BNF/EBNF, ANTLR4, Menhir, and Peggy grammars into
deterministic feature documents. It measures source structure, keeps rule-level
vectors, and records why a measurement is unavailable.

The browser sandbox compares two grammars and shows available distributions. A
GitHub Action measures the merge-base and updates a feature-diff comment. JSON/CSV
and an MCP server expose the same measurements to scripts and agents. The Grammar
Atlas includes twelve pinned inputs and sampled Ruby parse.y releases.

Parameterized rules can be expanded for FIRST/FOLLOW, LL(1), and raw SLR while
source metrics retain their original domain. Comparisons check capability and
representation context. Raw SLR counts omit precedence resolution and do not
reproduce generator conflict declarations. Bundled frontends keep grammar actions
and predicates opaque. gramin measures grammars without generating parsers or
providing a grammar editor.

Try it: https://ydah.github.io/gramin/sandbox

Data: https://ydah.github.io/gramin/atlas/

Before submission, verify that the published npm release and deployed site contain
the CSV, Action, MCP, and Atlas features described here. This file is a draft and
has not been submitted to Hacker News.
