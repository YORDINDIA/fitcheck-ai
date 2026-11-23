"""Isolated runner checks: no real servers, dependencies, or network requests."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest


RUNNER = Path(__file__).resolve().parents[2] / "run-dev.sh"


class RunDevTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="run dev ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copy2(RUNNER, self.root / "run-dev.sh")
        (self.root / "backend/.venv/bin").mkdir(parents=True)
        (self.root / "frontend/node_modules/vite/bin").mkdir(parents=True)
        (self.root / "frontend/node_modules/vite/bin/vite.js").touch()
        (self.root / "bin").mkdir()
        (self.root / "backend/.venv/bin/activate").write_text(
            f'export PATH="{self.root}/backend/.venv/bin:$PATH"\n'
        )
        server = f"""#!{sys.executable}
import os, pathlib, signal, sys, time
role = "backend" if pathlib.Path(sys.argv[0]).name in ("python", "uvicorn") else "frontend"
if "-c" in sys.argv:
    sys.exit(1 if os.environ.get("MISSING_UVICORN") else 0)
root = pathlib.Path(os.environ["FIXTURE"])
(root / (role + ".pid")).write_text(str(os.getpid()))
if os.environ.get("CRASH") == role:
    time.sleep(0.05)
    sys.exit(7)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
while True:
    time.sleep(0.01)
"""
        for path in ("backend/.venv/bin/python", "bin/uvicorn", "bin/node", "bin/npm"):
            self.executable(path, server)
        self.executable("bin/curl", '#!/bin/bash\n[ "$UNHEALTHY" != yes ]\n')
        self.executable("bin/sleep", f'#!{sys.executable}\nimport time\ntime.sleep(0.01)\n')
        self.env = dict(os.environ, PATH=f"{self.root}/bin:{os.environ['PATH']}", FIXTURE=str(self.root))
        self.process = None

    def executable(self, path, contents):
        target = self.root / path
        target.write_text(contents)
        target.chmod(0o755)

    def start(self, **env):
        self.log = open(self.root / "output", "w+")
        self.addCleanup(self.log.close)
        self.process = subprocess.Popen(
            ["bash", str(self.root / "run-dev.sh")], cwd="/",
            env=dict(self.env, **env), stdout=self.log, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.addCleanup(self.stop)

    def stop(self):
        if self.process:
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            self.process.wait()

    def output(self):
        self.log.flush()
        return (self.root / "output").read_text()

    def await_exit(self):
        try:
            return self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.fail("Runner did not exit:\n" + self.output())

    def assert_servers_stopped(self):
        for path in self.root.glob("*.pid"):
            with self.assertRaises(ProcessLookupError, msg=f"{path.stem} remains alive"):
                os.kill(int(path.read_text()), 0)

    def test_missing_virtualenv_has_setup_guidance(self):
        shutil.rmtree(self.root / "backend/.venv")
        self.start()
        self.assertNotEqual(self.await_exit(), 0)
        self.assertIn("python3.12 -m venv .venv", self.output())

    def test_missing_frontend_dependencies_fails_before_starting_backend(self):
        shutil.rmtree(self.root / "frontend/node_modules")
        self.start()
        self.assertNotEqual(self.await_exit(), 0)
        self.assertIn("npm ci", self.output())
        self.assertFalse((self.root / "backend.pid").exists())

    def test_unhealthy_backend_fails_and_is_cleaned_up(self):
        self.start(UNHEALTHY="yes")
        self.assertNotEqual(self.await_exit(), 0)
        self.assertFalse((self.root / "frontend.pid").exists())
        self.assert_servers_stopped()

    def test_missing_backend_dependencies_fails_before_starting_servers(self):
        self.start(MISSING_UVICORN="yes")
        self.assertNotEqual(self.await_exit(), 0)
        self.assertIn("pip install -r requirements.txt", self.output())
        self.assertFalse((self.root / "backend.pid").exists())

    def test_backend_crash_before_health_fails(self):
        self.start(CRASH="backend", UNHEALTHY="yes")
        self.assertNotEqual(self.await_exit(), 0)
        self.assertFalse((self.root / "frontend.pid").exists())
        self.assert_servers_stopped()

    def test_backend_crash_fails_and_cleans_up(self):
        self.start(CRASH="backend")
        self.assertNotEqual(self.await_exit(), 0)
        self.assert_servers_stopped()

    def test_frontend_crash_fails_and_cleans_up(self):
        self.start(CRASH="frontend")
        self.assertNotEqual(self.await_exit(), 0)
        self.assert_servers_stopped()

    def test_signal_stops_both_servers(self):
        self.start()
        deadline = time.monotonic() + 3
        while not (self.root / "frontend.pid").exists():
            if time.monotonic() > deadline:
                self.fail(self.output())
            time.sleep(0.01)
        self.process.terminate()
        self.assertEqual(self.await_exit(), 143)
        self.assert_servers_stopped()


if __name__ == "__main__":
    unittest.main()
