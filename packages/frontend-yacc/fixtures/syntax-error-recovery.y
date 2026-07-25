/* Verifies that one malformed rule does not hide a later valid rule. */
%token VALUE
%%
broken VALUE ;
valid: VALUE ;
