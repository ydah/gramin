%token <int> INT
%token COMMA EOF
%start <int list> main
%type <int> wrapper
%left COMMA

%%

%inline wrapper(X):
| value = X { value }
;

main:
| values = separated_list(COMMA, wrapper(INT)) maybe = option(INT) EOF { values }
;
