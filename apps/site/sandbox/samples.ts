import type { SandboxSample } from "./types";

const yaccJson = `%token STRING NUMBER TRUE FALSE NULL
%start json
%%
json
  : value
  ;
value
  : object
  | array
  | STRING
  | NUMBER
  | TRUE
  | FALSE
  | NULL
  ;
object
  : '{' '}'
  | '{' members '}'
  ;
members
  : member
  | members ',' member
  ;
member
  : STRING ':' value
  ;
array
  : '[' ']'
  | '[' elements ']'
  ;
elements
  : value
  | elements ',' value
  ;
`;

const antlrJson = `grammar Json;

json: value EOF;
value: object | array | STRING | NUMBER | TRUE | FALSE | NULL;
object: '{' (member (',' member)*)? '}';
member: STRING ':' value;
array: '[' (value (',' value)*)? ']';

TRUE: 'true';
FALSE: 'false';
NULL: 'null';
STRING: '"' .*? '"';
NUMBER: '-'? [0-9]+ ('.' [0-9]+)?;
WS: [ \t\r\n]+ -> skip;
`;

const peggyJson = `start = _ value:value _ { return value; }
value = object / array / string / number / "true" / "false" / "null"
object = "{" _ (member (_ "," _ member)*)? _ "}"
member = string _ ":" _ value
array = "[" _ (value (_ "," _ value)*)? _ "]"
string = '"' chars:[^" ]* '"'
number = "-"? [0-9]+ ("." [0-9]+)?
_ = [ \t\r\n]*
`;

const expressionEbnf = `<expr> ::= <term> { ("+" | "-") <term> }
<term> ::= <factor> { ("*" | "/") <factor> }
<factor> ::= "number" | "(" <expr> ")" | [ "-" ] "number";
`;

const menhirLists = `%token <int> INT
%token COMMA EOF
%start <int list> main
%type <int> wrapper
%left COMMA

%%

%inline wrapper(X):
| value = X { value }
;

main:
| values = separated_list(COMMA, wrapper(INT)) maybe = option(INT) EOF { values }
;
`;

const lramaParameterized = `/* Parameterized and standard-library calls. */
%token ITEM
%rule %inline wrapper(X) <node>
  : X
  ;
%%
start:
    wrapper(option(ITEM))[wrapped]
  | list(ITEM)
  | separated_list(',', ITEM)
  ;
`;

const diagnosticGrammar = `%token VALUE
%%
broken VALUE ;
valid: VALUE ;
`;

export const sandboxSamples: readonly SandboxSample[] = [
  {
    id: "json-yacc",
    label: "JSON in Yacc",
    description: "A small CFG with explicit recursion and literal tokens.",
    frontendId: "yacc-family",
    files: [{ name: "json.y", content: yaccJson }],
  },
  {
    id: "json-antlr",
    label: "JSON in ANTLR4",
    description: "Parser and lexer rules with EBNF repetition.",
    frontendId: "antlr4",
    files: [{ name: "Json.g4", content: antlrJson }],
  },
  {
    id: "json-peggy",
    label: "JSON in Peggy",
    description: "Ordered choice and scannerless expressions.",
    frontendId: "peggy",
    files: [{ name: "json.peggy", content: peggyJson }],
  },
  {
    id: "expression-ebnf",
    label: "Expression in EBNF",
    description: "Grouping, repetition, and optional sugar in a BNF-family grammar.",
    frontendId: "bnf",
    files: [{ name: "expression.ebnf", content: expressionEbnf }],
  },
  {
    id: "menhir-lists",
    label: "Lists in Menhir",
    description: "Standard-library calls and parameterized Menhir symbols.",
    frontendId: "menhir",
    files: [{ name: "lists.mly", content: menhirLists }],
  },
  {
    id: "lrama-parameterized",
    label: "Parameterized rules in Lrama",
    description: "Parameterized definitions, labels, and standard-library calls.",
    frontendId: "yacc-family",
    files: [{ name: "lrama.y", content: lramaParameterized }],
  },
  {
    id: "diagnostics",
    label: "Grammar with diagnostics",
    description: "A recoverable malformed rule and a later valid rule.",
    frontendId: "yacc-family",
    files: [{ name: "diagnostics.y", content: diagnosticGrammar }],
  },
];

export const defaultSample = sandboxSamples[0];
