/* Verifies indirect recursion without case-based symbol classification. */
%token END
%%
start: first END ;
first: second ;
second: first | %empty ;
