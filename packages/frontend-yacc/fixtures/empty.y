/* Verifies both comment-based and directive-based epsilon alternatives. */
%token ITEM
%%
items:
    /* empty */
  | items ITEM
  ;
optional:
    %empty
  | ITEM
  ;
