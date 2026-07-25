grammar Labels;

start: item EOF;
item
    : ID                              # Identifier
    | '[' item (',' item)* ']'       # List
    | {enabled()}? item               # Guarded
    ;

ID: [a-zA-Z_][a-zA-Z0-9_]*;
WS: [ \t\r\n]+ -> skip;
fragment DIGIT: [0-9];
