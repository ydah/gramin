%token STRING NUMBER TRUE FALSE NULL
%start json
%%
json
  : value
  ;
value
  : object
  | array
  | STRING
  | NUMBER
  | TRUE
  | FALSE
  | NULL
  ;
object
  : '{' '}'
  | '{' members '}'
  ;
members
  : member
  | members ',' member
  ;
member
  : STRING ':' value
  ;
array
  : '[' ']'
  | '[' elements ']'
  ;
elements
  : value
  | elements ',' value
  ;
%%
