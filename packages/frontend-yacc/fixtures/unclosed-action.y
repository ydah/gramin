/* Verifies diagnostic recovery from an action missing its closing brace. */
%token VALUE
%%
broken: VALUE { consume($1);
;
valid: VALUE ;
