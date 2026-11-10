grammar Arithmetic;

arithmetic: expression EOF;
expression: term PLUS expression | term MINUS expression | term;
term: factor STAR term | factor SLASH term | factor;
factor: NUMBER | LPAREN expression RPAREN;

NUMBER: '0' | [1-9] [0-9]*;
PLUS: '+';
MINUS: '-';
STAR: '*';
SLASH: '/';
LPAREN: '(';
RPAREN: ')';
WS: [ \t\r\n]+ -> skip;
