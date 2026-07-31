#!/usr/bin/env python3
"""Small deployment console backend for running the Good Shepherd Ansible playbook."""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import signal
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "deployment_console" / "static"
RUNS_DIR = ROOT / ".runs"
BASTIONS_FILE = ROOT / "config" / "bastions" / "bastions.json"
ENVIRONMENTS_DIR = ROOT / "config" / "environments"
PLAYBOOK = ROOT / "playbooks" / "deploy_gs_pov_harness_agent.yml"

STAGES = [
    {"id": "queued", "label": "Queued"},
    {"id": "preflight", "label": "Preflight"},
    {"id": "bootstrap", "label": "Bootstrap"},
    {"id": "source", "label": "Source"},
    {"id": "azure-auth", "label": "Azure Auth"},
    {"id": "deploy", "label": "Deploy"},
    {"id": "revision", "label": "Revision"},
    {"id": "verify", "label": "Verify"},
    {"id": "summary", "label": "Summary"},
]

STAGE_PATTERNS = [
    ("bootstrap", re.compile(r"(Bootstrap|Install |apt |yum |Azure CLI dynamic|Container Apps CLI)", re.I)),
    ("source", re.compile(r"(source path|Clone|Copy target application|Sync target application|target application repository|deployment script|Terraform variables)", re.I)),
    ("azure-auth", re.compile(r"(Login to Azure|Confirm Azure CLI|Select Azure subscription)", re.I)),
    ("deploy", re.compile(r"(Resolve image tag|Deploy app-only|Run app-only|Provision and deploy|Initialize Terraform|Bootstrap Terraform|Build image|Apply Terraform|Read Terraform)", re.I)),
    ("revision", re.compile(r"(Verify Azure Container App revision|Read Container App details|latest revision|Wait for latest revision)", re.I)),
    ("verify", re.compile(r"(Verify deployed application endpoints)", re.I)),
    ("summary", re.compile(r"(Deployment summary)", re.I)),
    ("preflight", re.compile(r"(Validate|Require|Check required|Gather bastion facts|Set package architecture)", re.I)),
]

TASK_RE = re.compile(r"^TASK \[(?P<task>.+?)]")
PLAY_RE = re.compile(r"^PLAY \[")
FATAL_RE = re.compile(r"\b(fatal:|FAILED!|ERROR!|UNREACHABLE!)\b", re.I)
RECAP_RE = re.compile(r"^PLAY RECAP")


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def load_bastions() -> list[dict[str, Any]]:
    data = read_json(BASTIONS_FILE)
    return data.get("bastions", [])


def load_environments() -> list[dict[str, Any]]:
    environments = []
    for path in sorted(ENVIRONMENTS_DIR.glob("*.json")):
        data = read_json(path)
        environments.append(
            {
                "id": path.stem,
                "name": path.stem.replace("-", " ").title(),
                "path": str(path.relative_to(ROOT)),
                "vars": data,
            }
        )
    return environments


def public_bastion(bastion: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": bastion["id"],
        "name": bastion.get("name", bastion["id"]),
        "host": bastion.get("ansible_host", "localhost"),
        "user": bastion.get("ansible_user", ""),
        "connection": bastion.get("ansible_connection", "ssh"),
        "sourceStrategy": bastion.get("vars", {}).get("gs_source_strategy", ""),
        "azureLoginMode": bastion.get("vars", {}).get("gs_azure_login_mode", ""),
    }


def make_inventory(bastion: dict[str, Any]) -> dict[str, Any]:
    host_vars: dict[str, Any] = {}
    for key in (
        "ansible_host",
        "ansible_user",
        "ansible_connection",
        "ansible_ssh_private_key_file",
        "ansible_port",
        "ansible_python_interpreter",
    ):
        if key in bastion and bastion[key] not in ("", None):
            host_vars[key] = bastion[key]

    return {
        "all": {
            "children": {
                "deployment_controller": {
                    "hosts": {
                        bastion["id"]: host_vars,
                    }
                }
            }
        }
    }


def merged_extra_vars(bastion: dict[str, Any], environment_vars: dict[str, Any], request_vars: dict[str, Any]) -> dict[str, Any]:
    merged = {}
    merged.update(environment_vars)
    merged.update(bastion.get("vars", {}))
    merged.update(request_vars)
    return merged


def safe_environment_id(environment_id: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", environment_id):
        raise ValueError("Invalid environment id")
    return environment_id


@dataclass
class Deployment:
    id: str
    bastion_id: str
    environment_id: str
    command: list[str]
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    status: str = "queued"
    return_code: int | None = None
    current_stage: str = "queued"
    stages: dict[str, str] = field(default_factory=lambda: {stage["id"]: "pending" for stage in STAGES})
    log: list[str] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    watchers: list[queue.Queue[dict[str, Any]]] = field(default_factory=list)
    process: subprocess.Popen[str] | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.stages["queued"] = "active"
        self.add_event("state", self.snapshot(), publish=False)

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "bastionId": self.bastion_id,
            "environmentId": self.environment_id,
            "status": self.status,
            "returnCode": self.return_code,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "currentStage": self.current_stage,
            "stages": [{"id": item["id"], "label": item["label"], "state": self.stages[item["id"]]} for item in STAGES],
            "command": self.command,
        }

    def add_event(self, kind: str, payload: Any, publish: bool = True) -> None:
        event = {"event": kind, "payload": payload, "time": time.time()}
        with self.lock:
            self.events.append(event)
            if len(self.events) > 1000:
                self.events = self.events[-1000:]
            watchers = list(self.watchers)
        if publish:
            for watcher in watchers:
                watcher.put(event)

    def add_log(self, line: str) -> None:
        with self.lock:
            self.log.append(line)
            if len(self.log) > 5000:
                self.log = self.log[-5000:]
        self.add_event("log", {"line": line})

    def set_stage(self, stage_id: str) -> None:
        if stage_id not in self.stages:
            return
        changed = False
        with self.lock:
            old_index = next((idx for idx, stage in enumerate(STAGES) if stage["id"] == self.current_stage), 0)
            new_index = next((idx for idx, stage in enumerate(STAGES) if stage["id"] == stage_id), old_index)
            for idx, stage in enumerate(STAGES):
                sid = stage["id"]
                if idx < new_index and self.stages[sid] not in ("failed", "complete"):
                    self.stages[sid] = "complete"
                    changed = True
            if self.current_stage != stage_id or self.stages[stage_id] != "active":
                self.current_stage = stage_id
                if self.stages[stage_id] != "failed":
                    self.stages[stage_id] = "active"
                changed = True
        if changed:
            self.add_event("state", self.snapshot())

    def mark_finished(self, return_code: int) -> None:
        with self.lock:
            self.return_code = return_code
            self.completed_at = time.time()
            self.status = "succeeded" if return_code == 0 else "failed"
            final_stage = self.current_stage
            if return_code == 0:
                for stage in STAGES:
                    self.stages[stage["id"]] = "complete"
                self.current_stage = "summary"
            else:
                for stage in STAGES:
                    if self.stages[stage["id"]] == "active":
                        self.stages[stage["id"]] = "failed"
                        final_stage = stage["id"]
                        break
                self.current_stage = final_stage
        self.add_event("state", self.snapshot())
        self.add_event("done", self.snapshot())
        with self.lock:
            watchers = list(self.watchers)
        for watcher in watchers:
            watcher.put({"event": "close", "payload": {}, "time": time.time()})


class DeploymentStore:
    def __init__(self) -> None:
        self.deployments: dict[str, Deployment] = {}
        self.lock = threading.Lock()

    def add(self, deployment: Deployment) -> None:
        with self.lock:
            self.deployments[deployment.id] = deployment

    def get(self, deployment_id: str) -> Deployment | None:
        with self.lock:
            return self.deployments.get(deployment_id)

    def list(self) -> list[Deployment]:
        with self.lock:
            return sorted(self.deployments.values(), key=lambda item: item.started_at, reverse=True)


STORE = DeploymentStore()


def classify_stage(line: str) -> str | None:
    task_match = TASK_RE.search(line)
    task = task_match.group("task") if task_match else line
    if PLAY_RE.search(line):
        return "preflight"
    if RECAP_RE.search(line):
        return "summary"
    for stage_id, pattern in STAGE_PATTERNS:
        if pattern.search(task):
            return stage_id
    return None


def run_deployment(deployment: Deployment, run_dir: Path, env: dict[str, str]) -> None:
    deployment.status = "running"
    deployment.set_stage("preflight")
    log_path = run_dir / "ansible.log"
    with log_path.open("w", encoding="utf-8") as log_file:
        try:
            process = subprocess.Popen(
                deployment.command,
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=env,
            )
            deployment.process = process
        except FileNotFoundError as exc:
            deployment.add_log(f"ERROR: {exc}")
            deployment.mark_finished(127)
            return

        assert process.stdout is not None
        for raw_line in process.stdout:
            line = raw_line.rstrip("\n")
            log_file.write(line + "\n")
            log_file.flush()
            deployment.add_log(line)
            stage_id = classify_stage(line)
            if stage_id:
                deployment.set_stage(stage_id)
            if FATAL_RE.search(line):
                deployment.status = "failed"
                deployment.add_event("state", deployment.snapshot())

        return_code = process.wait()
        deployment.mark_finished(return_code)


def create_deployment(payload: dict[str, Any]) -> Deployment:
    bastion_id = payload.get("bastionId", "")
    environment_id = safe_environment_id(payload.get("environmentId", ""))
    image_tag = payload.get("imageTag", "").strip()
    check_mode = bool(payload.get("checkMode", False))

    bastions = {item["id"]: item for item in load_bastions()}
    if bastion_id not in bastions:
        raise ValueError(f"Unknown bastion: {bastion_id}")
    environment_file = ENVIRONMENTS_DIR / f"{environment_id}.json"
    if not environment_file.exists():
        raise ValueError(f"Unknown environment: {environment_id}")

    bastion = bastions[bastion_id]
    environment_vars = read_json(environment_file)
    request_vars = {}
    if image_tag:
        request_vars["gs_image_tag"] = image_tag
    if check_mode:
        request_vars["gs_skip_build"] = True
        request_vars["gs_script_smoke_test"] = False
        request_vars["gs_verify_application"] = False

    deployment_id = uuid.uuid4().hex[:12]
    run_dir = RUNS_DIR / deployment_id
    run_dir.mkdir(parents=True, exist_ok=True)

    inventory_path = run_dir / "inventory.json"
    extra_vars_path = run_dir / "extra_vars.json"
    write_json(inventory_path, make_inventory(bastion))
    write_json(extra_vars_path, merged_extra_vars(bastion, environment_vars, request_vars))

    command = [
        "ansible-playbook",
        "-i",
        str(inventory_path),
        str(PLAYBOOK),
        "-e",
        f"@{extra_vars_path}",
    ]
    if check_mode:
        command.append("--check")

    deployment = Deployment(
        id=deployment_id,
        bastion_id=bastion_id,
        environment_id=environment_id,
        command=command,
    )
    STORE.add(deployment)

    env = os.environ.copy()
    env.update(
        {
            "ANSIBLE_FORCE_COLOR": "0",
            "ANSIBLE_HOST_KEY_CHECKING": "False",
            "PYTHONUNBUFFERED": "1",
        }
    )
    thread = threading.Thread(target=run_deployment, args=(deployment, run_dir, env), daemon=True)
    thread.start()
    return deployment


def sse_frame(event: dict[str, Any]) -> bytes:
    event_name = event["event"]
    payload = json.dumps(event["payload"])
    return f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")


class ConsoleHandler(BaseHTTPRequestHandler):
    server_version = "GoodShepherdDeployConsole/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[deploy-console] {self.address_string()} - {fmt % args}")

    def send_json(self, payload: Any, status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, message: str, status: int = 400) -> None:
        self.send_json({"error": message}, status=status)

    def read_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        return json.loads(body.decode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            return self.serve_static("index.html")
        if path.startswith("/static/"):
            return self.serve_static(path.removeprefix("/static/"))
        if path == "/api/bastions":
            return self.send_json({"bastions": [public_bastion(item) for item in load_bastions()]})
        if path == "/api/environments":
            return self.send_json({"environments": load_environments()})
        if path == "/api/deployments":
            return self.send_json({"deployments": [item.snapshot() for item in STORE.list()]})

        match = re.fullmatch(r"/api/deployments/([A-Za-z0-9_-]+)", path)
        if match:
            deployment = STORE.get(match.group(1))
            if not deployment:
                return self.send_error_json("Deployment not found", HTTPStatus.NOT_FOUND)
            return self.send_json(deployment.snapshot())

        match = re.fullmatch(r"/api/deployments/([A-Za-z0-9_-]+)/logs", path)
        if match:
            deployment = STORE.get(match.group(1))
            if not deployment:
                return self.send_error_json("Deployment not found", HTTPStatus.NOT_FOUND)
            return self.send_json({"lines": deployment.log})

        match = re.fullmatch(r"/api/deployments/([A-Za-z0-9_-]+)/events", path)
        if match:
            return self.stream_events(match.group(1), parse_qs(parsed.query))

        self.send_error_json("Not found", HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/deployments":
            try:
                deployment = create_deployment(self.read_body())
            except (json.JSONDecodeError, ValueError) as exc:
                return self.send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return self.send_json(deployment.snapshot(), HTTPStatus.CREATED)

        match = re.fullmatch(r"/api/deployments/([A-Za-z0-9_-]+)/cancel", parsed.path)
        if match:
            deployment = STORE.get(match.group(1))
            if not deployment:
                return self.send_error_json("Deployment not found", HTTPStatus.NOT_FOUND)
            if deployment.process and deployment.process.poll() is None:
                deployment.process.send_signal(signal.SIGTERM)
                deployment.add_log("Cancellation requested.")
            return self.send_json(deployment.snapshot())

        self.send_error_json("Not found", HTTPStatus.NOT_FOUND)

    def serve_static(self, relative_path: str) -> None:
        if not relative_path:
            relative_path = "index.html"
        target = (STATIC_DIR / relative_path).resolve()
        if STATIC_DIR.resolve() not in target.parents and target != STATIC_DIR.resolve():
            return self.send_error_json("Invalid static path", HTTPStatus.BAD_REQUEST)
        if not target.exists() or not target.is_file():
            return self.send_error_json("Not found", HTTPStatus.NOT_FOUND)
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_types.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def stream_events(self, deployment_id: str, query: dict[str, list[str]]) -> None:
        deployment = STORE.get(deployment_id)
        if not deployment:
            return self.send_error_json("Deployment not found", HTTPStatus.NOT_FOUND)

        watcher: queue.Queue[dict[str, Any]] = queue.Queue()
        with deployment.lock:
            replay = list(deployment.events)
            deployment.watchers.append(watcher)

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            if query.get("replay", ["1"])[0] != "0":
                for event in replay:
                    self.wfile.write(sse_frame(event))
                self.wfile.flush()
            while True:
                try:
                    event = watcher.get(timeout=15)
                except queue.Empty:
                    event = {"event": "heartbeat", "payload": {"time": time.time()}, "time": time.time()}
                self.wfile.write(sse_frame(event))
                self.wfile.flush()
                if event["event"] == "close":
                    break
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with deployment.lock:
                if watcher in deployment.watchers:
                    deployment.watchers.remove(watcher)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Good Shepherd deployment console")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    RUNS_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), ConsoleHandler)
    print(f"Deployment console listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
