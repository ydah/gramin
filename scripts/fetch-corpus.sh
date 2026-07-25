#!/bin/sh
set -eu

destination=${1:-fixtures/downloaded}
bison_commit=25b3d0e1a3f97a33615099e4b211f3953990c203
ruby_commit=33db313e855dfa83d7c66c2de6d63b9b401c32a0

mkdir -p "$destination/bison" "$destination/ruby"
curl -fsSL "https://raw.githubusercontent.com/akimd/bison/$bison_commit/examples/c/calc/calc.y" \
  -o "$destination/bison/calc.y"
curl -fsSL "https://raw.githubusercontent.com/ruby/ruby/$ruby_commit/parse.y" \
  -o "$destination/ruby/parse.y"
