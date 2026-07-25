#!/bin/sh
set -eu

destination=${1:-fixtures/downloaded}
bison_commit=9e3f67f424d34b141c77f6c825f95043f73e30f1
ruby_commit=33192f99a6f12b25d352f184d123eda1fcdbfc67

mkdir -p "$destination/bison" "$destination/ruby"
curl -fsSL "https://raw.githubusercontent.com/akimd/bison/$bison_commit/examples/c/calc/calc.y" \
  -o "$destination/bison/calc.y"
curl -fsSL "https://raw.githubusercontent.com/ruby/ruby/$ruby_commit/parse.y" \
  -o "$destination/ruby/parse.y"
