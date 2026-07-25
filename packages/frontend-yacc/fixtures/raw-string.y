/* Verifies that raw strings produce the documented warning without hiding later rules. */
%token VALUE
%%
first: VALUE { const char *raw = R"({})"; } ;
second: VALUE ;
