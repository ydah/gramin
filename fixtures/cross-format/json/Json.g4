grammar Json;

json: value EOF;
value: object | array | STRING | NUMBER | TRUE | FALSE | NULL;
object: LBRACE members RBRACE | LBRACE RBRACE;
members: member COMMA members | member;
member: STRING COLON value;
array: LBRACKET elements RBRACKET | LBRACKET RBRACKET;
elements: value COMMA elements | value;

STRING: '"' (~["\\\u0000-\u001F] | '\\' (["\\/bfnrt] | 'u' [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* '"';
NUMBER: '-'? ('0' | [1-9] [0-9]*) ('.' [0-9]+)? ([eE] [+-]? [0-9]+)?;
TRUE: 'true';
FALSE: 'false';
NULL: 'null';
LBRACE: '{';
RBRACE: '}';
LBRACKET: '[';
RBRACKET: ']';
COLON: ':';
COMMA: ',';
WS: [ \t\r\n]+ -> skip;
