import csv
import subprocess
from io import StringIO
from pathlib import Path

from read_rules import read_rule_metrics

root = Path(__file__).resolve().parents[2]
report = subprocess.run(
    [
        "node", "packages/cli/dist/bin.js", "analyze-many",
        "examples/csv-python/empty.bnf", "examples/csv-python/@choice.peggy",
        "--source-root", "examples/csv-python", "--format", "csv",
    ],
    cwd=root, check=True, capture_output=True, text=True,
).stdout
selected = [
    row for row in csv.DictReader(StringIO(report))
    if (row["scope"] == "rule" and row["metric"] in {"fanIn", "firstSetSize"})
    or (row["scope"] == "grammar" and row["metric"] == "parseability.firstSetSize" and row["notApplicable"])
]
with Path(__file__).with_name("rules.csv").open(encoding="utf-8", newline="") as stream:
    assert list(csv.DictReader(stream)) == selected

with Path(__file__).with_name("rules.csv").open(encoding="utf-8", newline="") as stream:
    rules, unavailable = read_rule_metrics(stream)

reason = "orderedChoice grammar: CFG FIRST, FOLLOW, and LL(1) analysis does not apply"
assert rules[("empty.bnf", "start")] == {"fanIn": 0, "firstSetSize": 0}
assert rules[("'@choice.peggy", "start")] == {"fanIn": 0}
assert unavailable == {("'@choice.peggy", "grammar", "", "parseability.firstSetSize"): reason}

empty = StringIO()
writer = csv.writer(empty)
writer.writerow(["grammar", "scope", "rule", "metric", "value", "notApplicable"])
writer.writerow(["sample", "rule", "start", "firstSetSize", "", "unavailable fixture"])
empty.seek(0)
rules, unavailable = read_rule_metrics(empty)
assert rules[("sample", "start")]["firstSetSize"] is None
assert unavailable[("sample", "rule", "start", "firstSetSize")] == "unavailable fixture"
print("CSV checks passed")
