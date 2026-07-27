#!/bin/sh
set -eu

destination=${1:-fixtures/downloaded}
bison_commit=25b3d0e1a3f97a33615099e4b211f3953990c203
perl_commit=44f4945c88a0598be10ee67b689de6ff4bf84bc1
ruby_commit=33db313e855dfa83d7c66c2de6d63b9b401c32a0
php_commit=f77523b538bd39c94144c5b8edb85e5230369d45
antlr_commit=e756f2a2ee5565a9300666f100ba6acd874664f7

mkdir -p "$destination/bison" "$destination/perl" "$destination/ruby" "$destination/php" \
  "$destination/antlr/json" "$destination/antlr/sqlite" "$destination/antlr/java"
curl -fsSL "https://raw.githubusercontent.com/akimd/bison/$bison_commit/examples/c/calc/calc.y" \
  -o "$destination/bison/calc.y"
curl -fsSL "https://raw.githubusercontent.com/Perl/perl5/$perl_commit/perly.y" \
  -o "$destination/perl/perly.y"
curl -fsSL "https://raw.githubusercontent.com/ruby/ruby/$ruby_commit/parse.y" \
  -o "$destination/ruby/parse.y"
curl -fsSL \
  "https://raw.githubusercontent.com/php/php-src/$php_commit/Zend/zend_language_parser.y" \
  -o "$destination/php/zend_language_parser.y"
curl -fsSL "https://raw.githubusercontent.com/antlr/grammars-v4/$antlr_commit/json/JSON.g4" \
  -o "$destination/antlr/json/JSON.g4"
curl -fsSL "https://raw.githubusercontent.com/antlr/grammars-v4/$antlr_commit/sql/sqlite/SQLiteParser.g4" \
  -o "$destination/antlr/sqlite/SQLiteParser.g4"
curl -fsSL "https://raw.githubusercontent.com/antlr/grammars-v4/$antlr_commit/sql/sqlite/SQLiteLexer.g4" \
  -o "$destination/antlr/sqlite/SQLiteLexer.g4"
curl -fsSL "https://raw.githubusercontent.com/antlr/grammars-v4/$antlr_commit/java/java/JavaParser.g4" \
  -o "$destination/antlr/java/JavaParser.g4"
curl -fsSL "https://raw.githubusercontent.com/antlr/grammars-v4/$antlr_commit/java/java/JavaLexer.g4" \
  -o "$destination/antlr/java/JavaLexer.g4"
