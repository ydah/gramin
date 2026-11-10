%token NUMBER PLUS MINUS STAR SLASH LPAREN RPAREN EOF
%start <unit> arithmetic
%%
arithmetic:
  | expression EOF { () }
;
expression:
  | term PLUS expression { () }
  | term MINUS expression { () }
  | term { () }
;
term:
  | factor STAR term { () }
  | factor SLASH term { () }
  | factor { () }
;
factor:
  | NUMBER { () }
  | LPAREN expression RPAREN { () }
;
