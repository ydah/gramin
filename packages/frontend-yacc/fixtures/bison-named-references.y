/* Verifies optional rule terminators and Bison named references on both sides. */
%token NUMBER
%start input
%%
input[result]:
    expression[value] { $$ = $value; }

expression[value]:
    NUMBER[number] { $$ = $number; }
