grammar Json;

json: value EOF;
value: object | array | STRING | NUMBER | TRUE | FALSE | NULL;
object: '{' (member (',' member)*)? '}';
member: STRING ':' value;
array: '[' (value (',' value)*)? ']';

TRUE: 'true';
FALSE: 'false';
NULL: 'null';
STRING: '"' .*? '"';
NUMBER: '-'? [0-9]+ ('.' [0-9]+)?;
WS: [ \t\r\n]+ -> skip;
