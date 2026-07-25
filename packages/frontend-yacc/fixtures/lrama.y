/* Verifies preamble %rule definitions, %inline, parameters, labels, and stdlib calls. */
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
