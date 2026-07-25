/* Verifies that a string alias resolves to one named terminal. */
%token OPEN "begin"
%%
start: "begin" OPEN ;
