/* Verifies braces and section markers inside declaration/action strings and comments. */
%code requires {
  struct Box { int value; };
  const char *marker = "%%";
}
%union { struct { int x; } nested; }
%token VALUE
%%
start:
    VALUE {
      const char *right = "}";
      char brace = '}';
      /* } %% */
      if (right) { consume(right); }
    }
  ;
