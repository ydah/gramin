---
title: "Measuring grammar changes with gramin"
description: "Source structure, derived parseability, and the conditions that make grammar metrics comparable."
---

# Measuring grammar changes with gramin

A grammar review often starts with a text diff. Counting added rules is easy;
following changed references, recursion, and the distribution of alternatives takes
more work. gramin records those structural facts as deterministic feature documents
so a reviewer can inspect the change at both grammar and rule level.

Five frontends translate Yacc/Bison/Lrama, BNF/EBNF, ANTLR4, Menhir, and Peggy into
the same validated Grammar IR. The analyzer measures that representation, and
reporters export JSON, Markdown, CSV, LLM digests, and SARIF. A measured zero means
the quantity is known to be zero. An unavailable measurement carries a reason in
`notApplicable`.

## Start with one rule

Save this as `hello.bnf`:

```text
start ::= "hello";
```

```sh
npx @gramin/cli analyze hello.bnf --frontend bnf --format md
```

The example has one rule and one alternative. Its rule vector records one RHS item,
no incoming or outgoing rule references, and FIRST and FOLLOW set sizes of one.
The [browser sandbox](../sandbox) runs the bundled frontends locally and can show
the available distributions and rule vectors alongside the raw documents.

## Keep source structure separate from derived parseability

Parameterized rules need concrete arguments before ordinary CFG analysis can
measure them. gramin expands locally defined templates only for FIRST/FOLLOW,
LL(1), and raw SLR analysis. Source size and structural measurements continue to
describe the original IR.

The [pinned Ruby development grammar](../atlas/ruby) illustrates the distinction.
Its source contains 251 rules, including 18 templates. The concrete measurement
domain retains 233 ordinary rules and adds 47 parameter instances and 28 EBNF
helpers, producing 308 rules. The features document records that domain, its
representation policy, effective capabilities, and expansion limits. Missing
external definitions or an exhausted expansion budget produce an unavailable
result instead of a partial count.

Raw SLR analysis of that concrete grammar records 1,440 LR(0) states, 4,911
shift/reduce conflict cells, and 3,039 reduce/reduce conflict cells. Its 17,296
item-to-conflict-cell involvements are a separate quantity: multiple items can
contribute to one conflicting state/token cell. These counts omit precedence and
associativity resolution. They cannot be compared with a parser generator's
`%expect` declarations or used to reproduce its resolved tables.

## Compare matching measurement contexts

Two grammars for the same language can have different structure. EBNF repetition
can replace explicit recursive rules, and a scannerless grammar can represent
terminals differently from a grammar with a separate lexer. Equal language coverage
does not imply equal structural counts.

The metric catalog classifies measurements as exact or heuristic and records
their comparison conditions. Class A supports comparisons across formats under
its definition. Class B requires the stated capability and representation context.
Class C is format-specific or heuristic; any within-context delta remains
descriptive and does not justify a cross-format ranking.

```sh
npx @gramin/cli diff before.json after.json --features --format md
```

The diff validates saved feature documents and matches source rule vectors by
exact name. It reports additions, removals, and individual field changes. A rename
appears as a removal and an addition. Incompatible numeric comparisons are omitted
with an explicit reason; a missing field is never converted to zero. The software's
tracked-increase policy can flag a change for review, but an increase does not prove
that a grammar has become worse or ambiguous.

## Use the same measurements in review and analysis

The GitHub Action measures a PR's merge-base automatically, updates a persistent
feature-diff comment, writes a job summary, and retains SARIF output. It reads the
baseline grammar from Git without executing code from that revision. A fork's
read-only token can prevent comments; the summary and report still remain useful.

For datasets, `analyze-many` treats each input file as a separate grammar and
exports either a JSON collection or CSV metric rows. Multiple files passed to
`analyze` instead belong to one grammar, such as an ANTLR parser and lexer.
The [Grammar Atlas](../atlas/) includes twelve inputs pinned by commit and hash,
with full feature vectors and a sampled [Ruby parse.y history](../atlas/ruby-history).
Its timeline records observations of source representations, not a causal account
of every change or a complexity leaderboard.

## Give agents data without executing grammar code

`@gramin/mcp` exposes `analyze`, `diff`, `ir`, and `digest` over stdio. Its tools
accept supplied text and validated documents, use only bundled frontends, and keep
source actions and predicates opaque. Requests run in disposable workers with
input/output limits, deadlines, heap limits, and a sampled memory-growth watchdog.
Those guards are not an operating-system sandbox. Returned grammar text also
remains untrusted data, rather than instructions for an agent.

The [metric catalog](../reference/metrics), [comparison guide](../concepts/comparability),
and [recorded corpus data](../atlas/) provide the definitions needed to read a number
before using it in a review or an experiment.
