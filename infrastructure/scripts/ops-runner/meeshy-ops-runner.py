#!/usr/bin/env python3
"""Le runner des operations serveur de l'administration Meeshy (#10385, #10386).

La passerelle n'a aucun pouvoir sur l'hote. Un BIGBOSS qui declenche une
operation depuis l'administration fait DEPOSER par la passerelle un fichier
<uuid>.json (moins d'1 Ko) dans /opt/meeshy/<env>/ops/requests. Une unite
systemd .path reveille ce runner, qui :

  - n'accepte qu'un fichier ORDINAIRE (lstat, puis open en O_NONBLOCK|O_NOFOLLOW et
    fstat : une FIFO glissee entre les deux ne bloque jamais le runner, #10459), de
    1024 octets au plus, en JSON strict, a la forme exacte du contrat (v = 1, uuid,
    action de la liste blanche, environnement = celui de l'unite), datee de moins de
    2 h et jamais du futur (un runner reveille tard n'execute pas un geste que
    personne ne tient plus) ;
  - deplace la demande vers done/ ou rejected/ AVANT toute execution, et ne
    recopie jamais le contenu d'une demande refusee ;
  - applique les delais (sauvegarde 6 h, purge 1 h), memorises dans l'etat, et
    la fenetre de la purge : de 02:00 a 06:00, heure de Paris (#11452) ; une purge
    traitee hors fenetre est refusee et nommee (outside-window), meme quand une
    passerelle ancienne, qui ne connait pas la fenetre, l'a deposee ;
  - n'execute que deux gestes fixes : la sauvegarde de l'environnement (l'instance
    @on-demand de son unite systemd, qui a sa propre rotation et ne fait jamais
    sortir une sauvegarde nocturne, #11450) et la purge des images Docker inutilisees (jamais un volume,
    jamais `system prune`) ; la purge vaut pour tout l'hote, production comprise :
    elle prend le verrou de la promotion de la production, pour ne jamais
    effacer l'image qu'une promotion vient de tirer et n'a pas encore demarree ;
  - publie l'etat dans state/ops.json, l'usage Docker dans state/docker.json et
    l'etat des conteneurs de SON environnement dans state/containers.json (#11441),
    seuls fichiers montes (en lecture seule) dans la passerelle. Les conteneurs sont
    ceux du projet compose dont le dossier est /opt/meeshy/<env> : staging ne voit
    jamais la production. Rien n'en est publie hors du contrat (nom, service,
    image et sa date, etat, sante, demarrage, consommation, reseaux, ports) : ni
    variable d'environnement, ni label, ni commande, ni montage.

Execute par `python3 -I` (aucun module du dossier courant n'est importe).

    meeshy-ops-runner.py process <env>     traiter les demandes en attente
    meeshy-ops-runner.py docker-df <env>   publier l'usage Docker
    meeshy-ops-runner.py init <env>        creer l'etat initial s'il manque
"""

import datetime
import fcntl
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import zoneinfo

ACTIONS = ("backup", "image-prune")
ENVIRONMENTS = ("staging", "production", "local")
COOLDOWN_SECONDS = {"backup": 6 * 3600, "image-prune": 3600}
# La fenetre de la purge (#11452, tranche par le porteur le 2026-10-24) : les heures
# creuses de l'hote partage, de 02:00 inclus a 06:00 exclu, heure de Paris (heure
# d'ete comprise, d'ou le fuseau nomme et jamais un decalage fixe). La passerelle
# refuse deja hors fenetre (OPERATION_OUTSIDE_WINDOW) ; le runner fait foi. La meme
# definition cote TypeScript : SERVER_OPERATION_WINDOWS, packages/shared/types/admin-ops.ts.
WINDOWS = {"image-prune": ("Europe/Paris", 2, 6)}
# Une demande acceptee a 05:59:58 et traitee juste apres 06:00 n'est pas refusee a tort.
WINDOW_GRACE_SECONDS = 10 * 60
# Le verdict de la sauvegarde de la production vit a cote de ses sauvegardes, pas dans son
# dossier d'environnement (#9668) : c'est le dossier que sa passerelle monte deja en
# lecture seule (BACKUP_STATUS_HOST_DIR, docker-compose.prod.yml).
BACKUP_STATUS_FILES = {"production": "/opt/meeshy/backups/nightly-status/etat.json"}
MAX_REQUEST_BYTES = 1024
IN_PROGRESS_HORIZON_SECONDS = 2 * 3600
STALE_TEMP_SECONDS = 60
KEEP_ARCHIVED_SECONDS = 30 * 24 * 3600
# Une demande valide mais datee hors de cette fenetre est refusee et nommee (#10459) :
# la passerelle n'a aucun moyen de revérifier le rang d'un demandeur a l'execution,
# donc le runner borne le DELAI entre le geste et son execution. Le meme horizon que
# la passerelle (IN_PROGRESS_HORIZON) : au-dela, elle tient deja la demande pour abandonnee.
REQUEST_MAX_AGE_SECONDS = IN_PROGRESS_HORIZON_SECONDS
REQUEST_MAX_FUTURE_SECONDS = 5 * 60
REQUEST_KEYS = {"v", "id", "action", "environment", "requestedBy", "requestedAt"}
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$")
SIZE_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([kKMGTP]?i?B)\s*")
UNITS = {"B": 1, "kB": 1000, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4, "PB": 1000**5,
         "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4}

# Les seuls gestes que le runner sait faire. Rien d'autre ne s'execute.
# Jamais `container prune`, `system prune`, `rm` ni `rmi` ici (#11452) : sur
# l'hote partage, l'epingle de retour arriere de la production EST un conteneur
# ARRETE (`meeshy-rollback-pin-<service>`, pose par meeshy-promote-production.sh)
# qui retient l'image N-1 hors de `image prune -a`. Un nettoyage lance par un
# ADMIN de staging ne doit jamais pouvoir toucher cette epingle. Le temoin
# `meeshy-ops-runner.test.mjs` tient cette liste.
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
        self.containers_file = os.path.join(self.state, "containers.json")
        self.compose_dir = os.environ.get("OPS_COMPOSE_DIR") or "/opt/meeshy/%s" % env
        self.backup_unit = os.environ.get("OPS_BACKUP_UNIT") or "meeshy-%s-backup@on-demand.service" % env
        self.backup_status = os.environ.get("OPS_BACKUP_STATUS_FILE") or BACKUP_STATUS_FILES.get(env) or "/opt/meeshy/%s/backup-status/etat.json" % env


def write_json_atomic(path, payload):
    directory = os.path.dirname(path)
    os.makedirs(directory, mode=0o755, exist_ok=True)
    # Un temporaire UNIQUE : deux passages concurrents (timer et demande) n'ecrivent
    # jamais dans le meme fichier, et un echec ne laisse pas de demi-publication.
    descriptor, temporary = tempfile.mkstemp(prefix=".%s." % os.path.basename(path), suffix=".tmp", dir=directory)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
            handle.write("\n")
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


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


def timeliness(request, moment):
    """Rend None, ou le code fixe d'une demande hors fenetre (trop vieille, ou du futur)."""
    try:
        age = (moment - parse_iso(request["requestedAt"])).total_seconds()
    except ValueError:
        return "invalid-date"
    if age > REQUEST_MAX_AGE_SECONDS:
        return "stale-request"
    if age < -REQUEST_MAX_FUTURE_SECONDS:
        return "future-request"
    return None


def local_hour(window, moment):
    zone, _, _ = window
    return moment.astimezone(zoneinfo.ZoneInfo(zone)).hour


def window_close(window, moment):
    """La fermeture de la fenetre du jour local de `moment` (06:00 n'est jamais une heure ambigue a Paris)."""
    zone, _, end = window
    local = moment.astimezone(zoneinfo.ZoneInfo(zone))
    return datetime.datetime.combine(local.date(), datetime.time(end), tzinfo=zoneinfo.ZoneInfo(zone))


def window_refusal(request, moment):
    """Rend None, ou `outside-window` pour une action fenetree traitee hors de sa fenetre.

    La tolerance ne vaut que pour une demande DATEE dans la fenetre : elle reste
    executable jusqu'a dix minutes apres la fermeture. Un fuseau illisible sur
    l'hote refuse (fail-closed) : on ne purge pas sans savoir l'heure de Paris.
    """
    window = WINDOWS.get(request["action"])
    if window is None:
        return None
    _, start, end = window
    try:
        if start <= local_hour(window, moment) < end:
            return None
        requested = parse_iso(request["requestedAt"])
        # Bornee des DEUX cotes : la tolerance ne court qu'APRES la fermeture. Sans la
        # borne basse, une demande datee dans le futur (jusqu'aux 5 min que tolere
        # timeliness) ouvrait la fenetre avant 02:00 (audit de #12743).
        late = (moment - window_close(window, requested)).total_seconds()
        if start <= local_hour(window, requested) < end and 0 <= late <= WINDOW_GRACE_SECONDS:
            return None
    except (ValueError, OSError, zoneinfo.ZoneInfoNotFoundError):
        pass
    return "outside-window"


def read_request(path):
    """Lit une demande sans jamais bloquer : rend (octets, None) ou (None, code).

    `lstat` a deja dit « fichier ordinaire », mais un processus qui ecrit dans le
    dossier (la passerelle, uid 1001) peut l'avoir remplace par une FIFO entre ce
    lstat et l'ouverture : un open bloquant y attendrait un ecrivain jusqu'au
    TimeoutStartSec de l'unite (#10459 point 2). O_NONBLOCK ouvre une FIFO sans
    attendre, O_NOFOLLOW refuse un lien, O_NOCTTY un terminal ; et c'est le fstat du
    descripteur OUVERT — pas le lstat du chemin — qui decide.
    """
    flags = os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NOCTTY", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError:
        return None, "unreadable"
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            return None, "not-regular-file"
        if info.st_size > MAX_REQUEST_BYTES:
            return None, "too-large"
        raw = os.read(descriptor, MAX_REQUEST_BYTES + 1)
    except OSError:
        return None, "unreadable"
    finally:
        os.close(descriptor)
    if len(raw) > MAX_REQUEST_BYTES:
        return None, "too-large"
    return raw, None


def parse_size(text):
    match = SIZE_RE.match(text or "")
    if not match:
        return 0
    return int(round(float(match.group(1)) * UNITS.get(match.group(2), 1)))


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


# Les conteneurs de l'environnement (#11441). Le contrat est celui de
# packages/shared/types/admin-ops-containers.ts : chaque champ est NORMALISE ici,
# car la passerelle rejette le fichier entier au premier champ hors schema.
CONTAINERS_MAX = 64
# Sous le plafond de lecture de la passerelle (256 Ko, OPS_CONTAINERS_FILE_MAX_BYTES).
CONTAINERS_FILE_BUDGET = 240 * 1024
COMPOSE_WORKING_DIR = "com.docker.compose.project.working_dir"
CONTAINER_STATES = ("created", "running", "paused", "restarting", "removing", "exited", "dead")
CONTAINER_HEALTHS = ("healthy", "unhealthy", "starting")
DOCKER_INSTANT_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
HEX_RE = re.compile(r"^[0-9a-f]{12,}$")
PORT_RE = re.compile(r"^(\d{1,5})/(tcp|udp|sctp)$")


def docker_instant(text):
    if not isinstance(text, str) or text.startswith("0001-"):
        return None
    match = DOCKER_INSTANT_RE.match(text)
    if not match:
        return None
    millis = int(((match.group(2) or ".0")[1:] + "000")[:3])
    offset = "+00:00" if match.group(3) == "Z" else match.group(3)
    moment = datetime.datetime.fromisoformat(match.group(1) + offset)
    return iso(moment.replace(microsecond=millis * 1000))


def short_id(digest):
    if not isinstance(digest, str):
        return None
    hexa = digest.split(":", 1)[-1]
    return hexa[:12] if HEX_RE.match(hexa) else None


def bounded(text, limit):
    return text[:limit] if isinstance(text, str) else ""


def whole(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, number)


def pair(text):
    left, _, right = (text or "").partition("/")
    return parse_size(left.strip()), parse_size(right.strip())


def container_stats(row, memory_limit):
    try:
        cpu = max(0.0, float(str(row.get("CPUPerc", "0")).strip().rstrip("%") or 0))
    except ValueError:
        cpu = 0.0
    used, _ = pair(row.get("MemUsage"))
    rx, tx = pair(row.get("NetIO"))
    read, write = pair(row.get("BlockIO"))
    return {
        "cpuPercent": round(cpu, 2),
        "memoryUsedBytes": used,
        "memoryLimitBytes": memory_limit,
        "netRxBytes": rx,
        "netTxBytes": tx,
        "blockReadBytes": read,
        "blockWriteBytes": write,
        "pids": whole(row.get("PIDs")),
    }


def container_ports(raw):
    ports = []
    seen = set()
    for key in sorted((raw or {}).keys()):
        match = PORT_RE.match(key or "")
        if not match or not 1 <= int(match.group(1)) <= 65535:
            continue
        port, protocol = int(match.group(1)), match.group(2)
        bindings = raw.get(key) or [None]
        for binding in bindings:
            host_port = whole((binding or {}).get("HostPort")) or None
            if host_port is not None and host_port > 65535:
                host_port = None
            identity = (port, protocol, host_port)
            if identity in seen:
                continue
            seen.add(identity)
            host_ip = bounded((binding or {}).get("HostIp"), 64) or None
            ports.append({"containerPort": port, "protocol": protocol, "hostIp": host_ip if host_port else None, "hostPort": host_port})
    ports.sort(key=lambda entry: (entry["hostPort"] is not None, entry["containerPort"]))
    return ports[:32]


def container_of(detail, image_dates, stats_by_id):
    state = detail.get("State") or {}
    config = detail.get("Config") or {}
    labels = config.get("Labels") or {}
    status = state.get("Status")
    health = (state.get("Health") or {}).get("Status")
    memory = whole((detail.get("HostConfig") or {}).get("Memory"))
    running = status == "running"
    networks = detail.get("NetworkSettings") or {}
    name = bounded((detail.get("Name") or "").lstrip("/"), 128) or short_id(detail.get("Id")) or "?"
    exit_code = state.get("ExitCode")
    stats = stats_by_id.get(detail.get("Id")) if running else None
    return {
        "name": name,
        "service": bounded(labels.get("com.docker.compose.service"), 128) or None,
        "image": bounded(config.get("Image"), 256) or short_id(detail.get("Image")) or "?",
        "imageId": short_id(detail.get("Image")),
        "imageCreatedAt": image_dates.get(detail.get("Image")),
        "state": status if status in CONTAINER_STATES else "dead",
        "health": health if health in CONTAINER_HEALTHS else "none",
        "startedAt": docker_instant(state.get("StartedAt")),
        "finishedAt": None if running else docker_instant(state.get("FinishedAt")),
        "restartCount": whole(detail.get("RestartCount")),
        "exitCode": exit_code if isinstance(exit_code, int) and not isinstance(exit_code, bool) else None,
        "stats": container_stats(stats, memory or None) if stats is not None else None,
        "networks": [
            {"name": bounded(network, 128), "ipAddress": bounded((settings or {}).get("IPAddress"), 64)}
            for network, settings in sorted((networks.get("Networks") or {}).items())
            if bounded(network, 128)
        ][:16],
        "ports": container_ports(networks.get("Ports")),
    }


def docker_json(args, check=True):
    result = subprocess.run(["docker"] + args, capture_output=True, text=True, timeout=120, check=check)
    return result.stdout


def stats_rows(output):
    rows = {}
    for line in output.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and isinstance(row.get("ID"), str):
            rows[row["ID"]] = row
    return rows


def within_budget(containers):
    # Un fichier hors plafond serait rejete EN ENTIER par la passerelle : on retire
    # plutot les derniers conteneurs, et on le dit.
    kept = list(containers)
    while kept and len(json.dumps({"measuredAt": "", "containers": kept}, separators=(",", ":"))) > CONTAINERS_FILE_BUDGET:
        kept.pop()
    if len(kept) < len(containers):
        log("containers: %d conteneur(s) hors budget, non publies" % (len(containers) - len(kept)))
    return kept


def containers_usage(paths):
    ids = [line.strip() for line in docker_json(
        ["ps", "-a", "-q", "--no-trunc", "--filter", "label=%s=%s" % (COMPOSE_WORKING_DIR, paths.compose_dir)],
    ).splitlines() if line.strip()][:CONTAINERS_MAX]
    if not ids:
        return {"measuredAt": iso(now_utc()), "containers": []}
    # Un conteneur retire entre `ps` et `inspect` fait sortir inspect en erreur, mais il imprime les autres.
    result = subprocess.run(["docker", "inspect"] + ids, capture_output=True, text=True, timeout=120)
    if result.returncode != 0 and not result.stdout.strip():
        # Rien d'inspecte : une collecte ratee, pas une liste vide — la derniere publication reste.
        raise subprocess.SubprocessError("inspect")
    inspected = json.loads(result.stdout or "[]")
    # Le filtre de `ps` est revérifié sur CHAQUE conteneur : rien d'un autre environnement ne se publie.
    details = [
        d for d in inspected
        if isinstance(d, dict) and ((d.get("Config") or {}).get("Labels") or {}).get(COMPOSE_WORKING_DIR) == paths.compose_dir
    ]
    image_ids = sorted({d.get("Image") for d in details if isinstance(d.get("Image"), str)})
    # Une image retiree fait sortir `image inspect` en erreur, mais il imprime les autres.
    images = json.loads(docker_json(["image", "inspect"] + image_ids, check=False) or "[]") if image_ids else []
    image_dates = {image.get("Id"): docker_instant(image.get("Created")) for image in images if isinstance(image, dict)}
    running = [d.get("Id") for d in details if (d.get("State") or {}).get("Status") == "running"]
    stats_by_id = stats_rows(docker_json(["stats", "--no-stream", "--no-trunc", "--format", "{{json .}}"] + running, check=False)) if running else {}
    containers = [container_of(detail, image_dates, stats_by_id) for detail in details]
    containers.sort(key=lambda c: (c["service"] or c["name"], c["name"]))
    return {"measuredAt": iso(now_utc()), "containers": within_budget(containers)}


def publish_docker_usage(paths):
    status = 0
    # Les deux publications sont independantes : un echec de l'une ne retient pas
    # l'autre, et une collecte ratee garde la derniere publication (rien n'est ecrit).
    # Les conteneurs d'abord : `system df` peut durer, leur mesure reste fraiche.
    try:
        write_json_atomic(paths.containers_file, containers_usage(paths))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        log("containers: echec (%s)" % type(error).__name__)
        status = 1
    try:
        write_json_atomic(paths.docker_file, docker_usage())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        log("docker-df: echec (%s)" % type(error).__name__)
        status = 1
    return status


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


PROMOTION_LOCK = "/run/lock/meeshy-promotion.lock"


def promotion_lock():
    """Le verrou de meeshy-promote-production.sh, pris sans le tronquer ni suivre un lien.

    Rend le descripteur verrouille, ou None si une promotion le tient encore au bout
    de l'attente (ou si le verrou ne s'ouvre pas : on ne purge pas a l'aveugle).
    """
    path = os.environ.get("OPS_PROMOTION_LOCK") or PROMOTION_LOCK
    wait = int(os.environ.get("OPS_PROMOTION_LOCK_WAIT") or 600)
    try:
        descriptor = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o644)
    except OSError:
        return None
    deadline = time.monotonic() + wait
    while True:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return descriptor
        except OSError:
            if time.monotonic() >= deadline:
                os.close(descriptor)
                return None
            time.sleep(1)


def run_image_prune(paths):
    lock = promotion_lock()
    if lock is None:
        return "failed", None, "promotion-in-progress"
    try:
        return prune_images(paths)
    finally:
        os.close(lock)


def prune_images(paths):
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
    raw, refusal = read_request(path)
    if refusal:
        archive(path, paths.rejected, rejected_name)
        log("demande refusee : %s" % refusal)
        return

    request, refusal = validate(raw, env, name)
    if refusal is None:
        received = now_utc()
        refusal = timeliness(request, received) or window_refusal(request, received)
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
