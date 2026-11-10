arithmetic = _ expression EOF
expression = term PLUS expression / term MINUS expression / term
term = factor STAR term / factor SLASH term / factor
factor = NUMBER / LPAREN expression RPAREN

NUMBER = ('0' / [1-9] [0-9]*) _
PLUS = '+' _
MINUS = '-' _
STAR = '*' _
SLASH = '/' _
LPAREN = '(' _
RPAREN = ')' _
EOF = !.
_ = [ \t\r\n]*
