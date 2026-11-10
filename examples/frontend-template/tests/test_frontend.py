import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXECUTABLE = ROOT / "bin" / "gramin-example-frontend"


class FrontendProtocolTests(unittest.TestCase):
    def parse(self, text):
        return subprocess.run(
            [sys.executable, str(EXECUTABLE), "parse", "--stdin"],
            input=text,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_literals_preserve_unicode_and_do_not_claim_sugar(self):
        result = self.parse('greeting ::= "日本語" | "[" | "";\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        ir = json.loads(result.stdout)
        self.assertEqual(ir["source"]["fileNames"], ["<stdin>"])
        self.assertEqual(ir["rules"][0]["alternatives"][0]["items"][0]["literal"], "日本語")
        self.assertEqual(len(ir["rules"][0]["alternatives"]), 3)
        self.assertFalse(any(ir["capabilities"].values()))
        self.assertEqual(self.parse('greeting ::= "日本語" | "[" | "";\n').stdout, result.stdout)

    def test_unsupported_syntax_fails_without_emitting_partial_json(self):
        for text in ['s ::= symbol;', 's ::= "x" { execute(); };', 's ::= "x" |;', 's ::= "x";\ns ::= "y";']:
            with self.subTest(text=text):
                result = self.parse(text)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertTrue(result.stderr)

    def test_invalid_invocation_uses_protocol_exit_code(self):
        result = subprocess.run(
            [sys.executable, str(EXECUTABLE), "parse"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stdout, "")

    def test_multiple_paths_are_read_without_modifying_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / "first.bnf", Path(directory) / "second.bnf"]
            content = ['first ::= "a";\n', 'second ::= "b";\n']
            for path, text in zip(paths, content):
                path.write_text(text, encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(EXECUTABLE), "parse", *map(str, paths)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            ir = json.loads(result.stdout)
            self.assertEqual(ir["source"]["fileNames"], list(map(str, paths)))
            self.assertEqual([rule["name"] for rule in ir["rules"]], ["first", "second"])
            self.assertEqual([path.read_text(encoding="utf-8") for path in paths], content)


if __name__ == "__main__":
    unittest.main()
