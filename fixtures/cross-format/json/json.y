%token STRING NUMBER TRUE FALSE NULL
%token LBRACE RBRACE LBRACKET RBRACKET COLON COMMA EOF
%start json
%%
json
  : value EOF
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
  : LBRACE members RBRACE
  | LBRACE RBRACE
  ;
members
  : member COMMA members
  | member
  ;
member
  : STRING COLON value
  ;
array
  : LBRACKET elements RBRACKET
  | LBRACKET RBRACKET
  ;
elements
  : value COMMA elements
  | value
  ;
%%
