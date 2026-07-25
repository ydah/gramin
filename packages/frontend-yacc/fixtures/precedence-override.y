/* Verifies literal precedence tokens and a named %prec override. */
%token NUMBER
%left '+' '-'
%precedence NEGATE
%%
expr:
    NUMBER
  | expr '+' expr
  | '-' expr %prec NEGATE
  ;
