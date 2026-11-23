"""Local builds must not notify a production indexing service."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class IndexNowTests(unittest.TestCase):
    def run_script(self, context):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "public").mkdir()
            (root / "dist").mkdir()
            shutil.copy(
                Path(__file__).resolve().parents[2] / "frontend/scripts/ping-indexnow.mjs",
                root / "scripts/ping-indexnow.mjs",
            )
            (root / "public/indexnow-key.txt").write_text("test-key")
            (root / "dist/sitemap.xml").write_text(
                "<urlset><url><loc>https://fitcheckaiapp.com/</loc></url></urlset>"
            )
            env = {k: v for k, v in os.environ.items() if k not in ("CONTEXT", "INDEXNOW_KEY")}
            env["CONTEXT"] = context
            result = subprocess.run(
                ["node", "--input-type=module", "-e",
                 'globalThis.fetch=async()=>{console.log("FETCH_CALLED");'
                 'return {ok:true,status:200}};await import('
                 + json.dumps((root / "scripts/ping-indexnow.mjs").as_uri()) + ')'],
                env=env, capture_output=True, text=True, check=True,
            )
            self.assertTrue((root / "dist/.well-known/indexnow/test-key.txt").exists())
            return result.stdout

    def test_local_build_does_not_submit(self):
        self.assertNotIn("FETCH_CALLED", self.run_script(""))

    def test_preview_build_does_not_submit(self):
        self.assertNotIn("FETCH_CALLED", self.run_script("deploy-preview"))

    def test_production_build_still_submits(self):
        self.assertIn("FETCH_CALLED", self.run_script("production"))


if __name__ == "__main__":
    unittest.main()
