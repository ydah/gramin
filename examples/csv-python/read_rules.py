import csv
import sys
from pathlib import Path


def read_rule_metrics(stream):
    rules = {}
    unavailable = {}
    for row in csv.DictReader(stream):
        grammar, scope, rule, metric = (row[key] for key in ("grammar", "scope", "rule", "metric"))
        if row["notApplicable"]:
            unavailable[(grammar, scope, rule, metric)] = row["notApplicable"]
        if scope != "rule" or metric not in {"fanIn", "firstSetSize"}:
            continue
        value = int(row["value"]) if row["value"] != "" else None
        rules.setdefault((grammar, rule), {})[metric] = value
    return rules, unavailable


if __name__ == "__main__":
    with Path(sys.argv[1]).open(encoding="utf-8", newline="") as stream:
        rules, unavailable = read_rule_metrics(stream)
    for (grammar, rule), metrics in sorted(rules.items()):
        print(f"{grammar}/{rule}: {metrics}")
    for (grammar, scope, rule, metric), reason in sorted(unavailable.items()):
        print(f"{grammar} [{scope}:{rule}] {metric}: {reason}")
