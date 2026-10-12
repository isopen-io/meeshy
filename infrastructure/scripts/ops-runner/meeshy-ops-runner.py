#!/usr/bin/env python3
"""Le runner des operations serveur de l'administration Meeshy (#10385, #10386).

La passerelle n'a aucun pouvoir sur l'hote. Un BIGBOSS qui declenche une
operation depuis l'administration fait DEPOSER par la passerelle un fichier
<uuid>.json (moins d'1 Ko) dans /opt/meeshy/<env>/ops/requests. Une unite
systemd .path reveille ce runner, qui :

  - n'accepte qu'un fichier ORDINAIRE (lstat : aucun lien suivi), de 1024 octets
    au plus, en JSON strict, a la forme exacte du contrat (v = 1, uuid, action de
    la liste blanche, environnement = celui de l'unite) ;
  - deplace la demande vers done/ ou rejected/ AVANT toute execution, et ne
    recopie jamais le contenu d'une demande refusee ;
  - applique les delais (sauvegarde 6 h, purge 1 h), memorises dans l'etat ;
  - n'execute que deux gestes fixes : la sauvegarde de l'environnement (son
    unite systemd) et la purge des images Docker inutilisees (jamais un volume,
    jamais `system prune`) ;
  - publie l'etat dans state/ops.json et l'usage Docker dans state/docker.json,
    seuls fichiers montes (en lecture seule) dans la passerelle.

Execute par `python3 -I` (aucun module du dossier courant n'est importe).

    meeshy-ops-runner.py process <env>     traiter les demandes en attente
    meeshy-ops-runner.py docker-df <env>   publier l'usage Docker
    meeshy-ops-runner.py init <env>        creer l'etat initial s'il manque
"""

import datetime
import json
import os
import re
import stat
import subprocess
import sys
import time

ACTIONS = ("backup", "image-prune")
ENVIRONMENTS = ("staging", "production", "local")
COOLDOWN_SECONDS = {"backup": 6 * 3600, "image-prune": 3600}
MAX_REQUEST_BYTES = 1024
IN_PROGRESS_HORIZON_SECONDS = 2 * 3600
STALE_TEMP_SECONDS = 60
KEEP_ARCHIVED_SECONDS = 30 * 24 * 3600
REQUEST_KEYS = {"v", "id", "action", "environment", "requestedBy", "requestedAt"}
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$")
SIZE_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([kKMGTP]?i?B)\s*")
UNITS = {"B": 1, "kB": 1000, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4, "PB": 1000**5,
         "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}

# Les seuls gestes que le runner sait faire. Rien d'autre ne s'execute.
PRUNE_COMMANDS = (
    ("docker", "image", "prune", "-f"),
    ("docker", "image", "prune", "-af", "--filter", "until=168h"),
    ("docker", "builder", "prune", "-f"),
)


def now_utc():
    override = os.environ.get("OPS_NOW")
    if override:
        return datetime.datetime.fromisoformat(override.replace("Z", "+00:00"))
    return datetime.datetime.now(datetime.timezone.utc)


def iso(moment):
    return moment.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (moment.microsecond // 1000)


def parse_iso(text):
    return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))


def log(message):
    sys.stdout.write("%s %s\n" % (iso(now_utc()), message))
    sys.stdout.flush()


class Paths:
    def __init__(self, env):
        base = os.environ.get("OPS_BASE_DIR") or "/opt/meeshy/%s/ops" % env
        self.base = base
        self.requests = os.path.join(base, "requests")
        self.state = os.path.join(base, "state")
        self.done = os.path.join(base, "done")
        self.rejected = os.path.join(base, "rejected")
        self.ops_file = os.path.join(self.state, "ops.json")
        self.docker_file = os.path.join(self.state, "docker.json")
        self.backup_unit = os.environ.get("OPS_BACKUP_UNIT") or "meeshy-%s-backup.service" % env
        self.backup_status = os.environ.get("OPS_BACKUP_STATUS_FILE") or "/opt/meeshy/%s/backup-status/etat.json" % env


def write_json_atomic(path, payload):
    directory = os.path.dirname(path)
    os.makedirs(directory, mode=0o755, exist_ok=True)
    temporary = os.path.join(directory, ".%s.tmp" % os.path.basename(path))
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def empty_state():
    return {"v": 1, "runs": {action: None for action in ACTIONS}, "lastAcceptedAt": {action: None for action in ACTIONS}}


def read_state(paths):
    try:
        with open(paths.ops_file, "r", encoding="utf-8") as handle:
            state = json.load(handle)
        if state.get("v") != 1:
            return empty_state()
        runs = state.get("runs") or {}
        accepted = state.get("lastAcceptedAt") or {}
        return {
            "v": 1,
            "runs": {action: runs.get(action) for action in ACTIONS},
            "lastAcceptedAt": {action: accepted.get(action) for action in ACTIONS},
        }
    except (OSError, ValueError, AttributeError):
        return empty_state()


def run_record(request, status, started=None, finished=None, reclaimed=None, code=None):
    return {
        "requestId": request["id"],
        "operation": request["action"],
        "status": status,
        "requestedBy": request["requestedBy"],
        "requestedAt": request["requestedAt"],
        "startedAt": iso(started) if started else None,
        "finishedAt": iso(finished) if finished else None,
        "reclaimedBytes": reclaimed,
        "code": code,
    }


def archive(path, destination_dir, name):
    os.makedirs(destination_dir, mode=0o700, exist_ok=True)
    os.rename(path, os.path.join(destination_dir, name))


def _reject_constant(_):
    raise ValueError("non-finite number")


def _unique_object(pairs):
    keys = [key for key, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate key")
    return dict(pairs)


def validate(raw, env, name):
    """Rend (demande, None) ou (demande | None, code). Le code est une cle fixe.

    Une demande n'est rendue avec son refus que lorsque TOUS ses champs ont passe
    la validation et que seul l'environnement differe : rien de non valide n'est
    jamais recopie dans l'etat publie.
    """
    try:
        request = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeDecodeError):
        return None, "invalid-json"
    if not isinstance(request, dict) or set(request.keys()) != REQUEST_KEYS:
        return None, "invalid-shape"
    if isinstance(request["v"], bool) or request["v"] != 1:
        return None, "invalid-version"
    if not isinstance(request["id"], str) or not UUID_RE.match(request["id"]) or name != "%s.json" % request["id"]:
        return None, "invalid-id"
    if not isinstance(request["action"], str) or request["action"] not in ACTIONS:
        return None, "unknown-action"
    if not isinstance(request["requestedBy"], str) or not 0 < len(request["requestedBy"]) <= 128:
        return None, "invalid-requester"
    if not isinstance(request["requestedAt"], str) or not ISO_RE.match(request["requestedAt"]):
        return None, "invalid-date"
    if request["environment"] != env:
        return request, "wrong-environment"
    return request, None


def parse_size(text):
    match = SIZE_RE.match(text or "")
    if not match:
        return 0
    return int(float(match.group(1)) * UNITS.get(match.group(2), 1))


def reclaimed_bytes(output):
    total = 0
    for line in output.splitlines():
        if "reclaimed space" in line.lower():
            total += parse_size(line.split(":", 1)[-1])
    return total


def docker_usage():
    result = subprocess.run(
        ["docker", "system", "df", "--format", "{{json .}}"],
        capture_output=True, text=True, timeout=120, check=True,
    )
    rows = {}
    for line in result.stdout.splitlines():
        line = line.strip()
        if line:
            row = json.loads(line)
            rows[row.get("Type")] = row

    def count(row, key):
        try:
            return max(0, int(str(row.get(key, "0")).strip() or 0))
        except ValueError:
            return 0

    images = rows.get("Images", {})
    cache = rows.get("Build Cache", {})
    volumes = rows.get("Local Volumes", {})
    return {
        "measuredAt": iso(now_utc()),
        "images": {
            "count": count(images, "TotalCount"),
            "activeCount": count(images, "Active"),
            "totalBytes": parse_size(images.get("Size")),
            "reclaimableBytes": parse_size(images.get("Reclaimable")),
        },
        "buildCache": {
            "totalBytes": parse_size(cache.get("Size")),
            "reclaimableBytes": parse_size(cache.get("Reclaimable")),
        },
        "volumes": {
            "count": count(volumes, "TotalCount"),
            "totalBytes": parse_size(volumes.get("Size")),
            "reclaimableBytes": parse_size(volumes.get("Reclaimable")),
        },
    }


def publish_docker_usage(paths):
    try:
        write_json_atomic(paths.docker_file, docker_usage())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        log("docker-df: echec (%s)" % type(error).__name__)
        return 1
    return 0


def run_backup(paths, started):
    result = subprocess.run(["systemctl", "start", "--wait", paths.backup_unit], capture_output=True, text=True)
    if result.returncode != 0:
        return "failed", None, "backup-failed"
    try:
        with open(paths.backup_status, "r", encoding="utf-8") as handle:
            verdict = json.load(handle)
        generated = parse_iso(verdict["generatedAt"])
    except (OSError, ValueError, KeyError, TypeError):
        return "failed", None, "verdict-unreadable"
    if verdict.get("status") != "ok":
        return "failed", None, "verdict-failed"
    if generated < started.replace(microsecond=0):
        return "failed", None, "verdict-stale"
    return "succeeded", None, None


def run_image_prune(paths):
    reclaimed = 0
    for command in PRUNE_COMMANDS:
        result = subprocess.run(list(command), capture_output=True, text=True, timeout=1800)
        if result.returncode != 0:
            publish_docker_usage(paths)
            return "failed", reclaimed, "prune-failed"
        reclaimed += reclaimed_bytes(result.stdout)
    publish_docker_usage(paths)
    return "succeeded", reclaimed, None


def is_live(run, moment):
    if not run or run.get("status") not in ("queued", "running"):
        return False
    try:
        return (moment - parse_iso(run["requestedAt"])).total_seconds() < IN_PROGRESS_HORIZON_SECONDS
    except (KeyError, ValueError, TypeError):
        return False


def sweep(directory, max_age):
    try:
        entries = os.listdir(directory)
    except OSError:
        return
    limit = time.time() - max_age
    for name in entries:
        path = os.path.join(directory, name)
        try:
            info = os.lstat(path)
            if info.st_mtime < limit and not stat.S_ISDIR(info.st_mode):
                os.unlink(path)
        except OSError:
            continue


def handle_request(paths, env, name, state):
    path = os.path.join(paths.requests, name)
    try:
        info = os.lstat(path)
    except OSError:
        return
    if name.startswith("."):
        if stat.S_ISREG(info.st_mode) and time.time() - info.st_mtime > STALE_TEMP_SECONDS:
            os.unlink(path)
        return

    rejected_name = "%s-%s" % (int(time.time() * 1000), re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80])
    if not stat.S_ISREG(info.st_mode):
        archive(path, paths.rejected, rejected_name)
        log("demande refusee : not-regular-file")
        return
    if info.st_size > MAX_REQUEST_BYTES:
        archive(path, paths.rejected, rejected_name)
        log("demande refusee : too-large")
        return
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as handle:
            raw = handle.read(MAX_REQUEST_BYTES + 1)
    except OSError:
        archive(path, paths.rejected, rejected_name)
        log("demande refusee : unreadable")
        return

    request, refusal = validate(raw, env, name)
    if refusal:
        archive(path, paths.rejected, rejected_name)
        log("demande refusee : %s" % refusal)
        if request is not None:
            state["runs"][request["action"]] = run_record(request, "rejected", code=refusal)
            write_json_atomic(paths.ops_file, state)
        return

    archive(path, paths.done, name)
    action = request["action"]
    moment = now_utc()
    last = state["lastAcceptedAt"].get(action)
    if last and (moment - parse_iso(last)).total_seconds() < COOLDOWN_SECONDS[action]:
        state["runs"][action] = run_record(request, "throttled", finished=moment, code="cooldown")
        write_json_atomic(paths.ops_file, state)
        log("%s %s : delai non ecoule" % (action, request["id"]))
        return
    if is_live(state["runs"].get(action), moment):
        state["runs"][action] = run_record(request, "throttled", finished=moment, code="in-progress")
        write_json_atomic(paths.ops_file, state)
        return

    state["lastAcceptedAt"][action] = iso(moment)
    state["runs"][action] = run_record(request, "running", started=moment)
    write_json_atomic(paths.ops_file, state)
    log("%s %s : demarre (par %s)" % (action, request["id"], re.sub(r"[^\w.@-]", "_", request["requestedBy"])))

    try:
        if action == "backup":
            status, reclaimed, code = run_backup(paths, moment)
        else:
            status, reclaimed, code = run_image_prune(paths)
    except (OSError, subprocess.SubprocessError):
        status, reclaimed, code = "failed", None, "runner-error"

    state["runs"][action] = run_record(request, status, started=moment, finished=now_utc(), reclaimed=reclaimed, code=code)
    write_json_atomic(paths.ops_file, state)
    log("%s %s : %s%s" % (action, request["id"], status, " (%s)" % code if code else ""))


def process(env):
    paths = Paths(env)
    state = read_state(paths)
    if not os.path.exists(paths.ops_file):
        write_json_atomic(paths.ops_file, state)
    try:
        names = sorted(os.listdir(paths.requests))
    except OSError:
        log("dossier des demandes introuvable")
        return 1
    for name in names:
        handle_request(paths, env, name, state)
    sweep(paths.done, KEEP_ARCHIVED_SECONDS)
    sweep(paths.rejected, KEEP_ARCHIVED_SECONDS)
    return 0


def init(env):
    paths = Paths(env)
    if not os.path.exists(paths.ops_file):
        write_json_atomic(paths.ops_file, empty_state())
    return publish_docker_usage(paths)


def main(argv):
    if len(argv) != 3 or argv[1] not in ("process", "docker-df", "init") or argv[2] not in ENVIRONMENTS:
        sys.stderr.write("usage: meeshy-ops-runner.py process|docker-df|init staging|production|local\n")
        return 2
    os.umask(0o022)
    command, env = argv[1], argv[2]
    if command == "process":
        return process(env)
    if command == "docker-df":
        return publish_docker_usage(Paths(env))
    return init(env)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
