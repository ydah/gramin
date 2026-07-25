/* Verifies precedence declarations, %prec, aliases, epsilon, actions, and types. */
%union { struct { int value; } node; }
%token <number> NUMBER
%token IF "if"
%left '+' '-'
%right UMINUS
%start input
%type <node> expr
%%
input:
    %empty
  | input expr ';'
  ;

expr:
    NUMBER
  | "if" expr
  | expr '+' expr { $$ = $1 + $3; }
  | '-' expr %prec UMINUS
  | expr { remember($1); } '-' expr
  ;
%%
/* The epilogue is intentionally opaque. */
