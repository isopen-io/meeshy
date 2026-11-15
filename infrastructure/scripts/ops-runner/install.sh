#!/bin/bash
# Installe le relais des operations de l'administration Meeshy sur l'hote (#10385, #10386).
#
#   sudo infrastructure/scripts/ops-runner/install.sh staging
#   sudo infrastructure/scripts/ops-runner/install.sh production   (feu vert du porteur, 2026-10-24, #11509)
#
# Pose, pour l'environnement donne :
#   /opt/meeshy/<env>/ops/requests   demandes deposees par la passerelle (uid 1001, 0700)
#   /opt/meeshy/<env>/ops/state      ops.json, docker.json et containers.json, lus par la passerelle (0755)
#   /opt/meeshy/<env>/ops/done       demandes executees (root, 0700, 30 jours)
#   /opt/meeshy/<env>/ops/rejected   demandes refusees  (root, 0700, 30 jours)
#   /opt/meeshy/<env>/ops/bin        le runner et le script de sauvegarde du depot
# puis les unites systemd, et les active :
#   meeshy-ops@<env>.path, meeshy-ops-docker-df@<env>.timer, meeshy-<env>-backup.timer
# La sauvegarde est un gabarit meeshy-<env>-backup@.service : le timer lance l'instance
# @nightly, le relais l'instance @on-demand, chacune avec sa rotation (#11450).
#
# La production (#11509) differe en trois points :
#   - sa sauvegarde nocturne existe deja (meeshy-nightly-backup.timer, #9665) : aucun timer
#     n'est pose, seul le gabarit meeshy-production-backup@.service, que le relais lance en
#     @on-demand ; le script de la nocturne (ops/meeshy-nightly-backup.sh) est mis a jour
#     avec celui du depot, pour que chaque origine ait sa rotation (#11450) ;
#   - /opt/meeshy/production/ops garde son mode 700 : il porte d'autres scripts de la
#     production. La passerelle n'y accede que par ses deux montages ;
#   - son verdict de sauvegarde est /opt/meeshy/backups/nightly-status (le runner le sait).
# Le compose de l'environnement monte ensuite :
#   /opt/meeshy/<env>/ops/requests:/ops-requests et /opt/meeshy/<env>/ops/state:/ops-state:ro
set -euo pipefail

ENV_NAME="${1:-}"
if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "usage: install.sh staging|production" >&2
  exit 2
fi
if [[ "$(id -u)" != 0 ]]; then
  echo "install.sh doit tourner en root" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_SCRIPTS="$(cd "$HERE/.." && pwd)"
OPS_DIR="/opt/meeshy/$ENV_NAME/ops"
GATEWAY_UID=1001
UNIT_DIR=/etc/systemd/system

OPS_DIR_MODE=755
[[ "$ENV_NAME" == production ]] && OPS_DIR_MODE=700
install -d -m "$OPS_DIR_MODE" -o root -g root "$OPS_DIR"
install -d -m 755 -o root -g root "$OPS_DIR/bin" "$OPS_DIR/state"
install -d -m 700 -o root -g root "$OPS_DIR/done" "$OPS_DIR/rejected"
install -d -m 700 -o "$GATEWAY_UID" -g "$GATEWAY_UID" "$OPS_DIR/requests"
chown "$GATEWAY_UID:$GATEWAY_UID" "$OPS_DIR/requests"
chmod 700 "$OPS_DIR/requests"

install -m 755 -o root -g root "$HERE/meeshy-ops-runner.py" "$OPS_DIR/bin/meeshy-ops-runner.py"
install -m 755 -o root -g root "$REPO_SCRIPTS/production-backup/meeshy-nightly-backup.sh" "$OPS_DIR/bin/meeshy-nightly-backup.sh"

UNITS=(meeshy-ops@.path meeshy-ops@.service meeshy-ops-docker-df@.service meeshy-ops-docker-df@.timer "meeshy-$ENV_NAME-backup@.service")
BACKUP_TIMER="meeshy-$ENV_NAME-backup.timer"
if [[ "$ENV_NAME" == production ]]; then
  # La nocturne de la production garde SON timer (meeshy-nightly-backup.timer) ; son script
  # passe a la version du depot (rotation par origine, #11450), l'ancien est garde a cote.
  NIGHTLY="$OPS_DIR/meeshy-nightly-backup.sh"
  # Une seule fois : rejouer l'installation ne remplace jamais l'original garde.
  [[ -f "$NIGHTLY" && ! -e "$NIGHTLY.avant-11509" ]] && cp -p "$NIGHTLY" "$NIGHTLY.avant-11509"
  install -m 700 -o root -g root "$REPO_SCRIPTS/production-backup/meeshy-nightly-backup.sh" "$NIGHTLY"
  BACKUP_TIMER=""
else
  UNITS+=("$BACKUP_TIMER")
fi
for unit in "${UNITS[@]}"; do
  install -m 644 -o root -g root "$HERE/$unit" "$UNIT_DIR/$unit"
done
# L'unite d'avant le gabarit ne doit plus pouvoir etre lancee : elle sauvegardait sans origine.
rm -f "$UNIT_DIR/meeshy-$ENV_NAME-backup.service"

/usr/bin/python3 -I "$OPS_DIR/bin/meeshy-ops-runner.py" init "$ENV_NAME"
chmod 644 "$OPS_DIR/state/"*.json

systemctl daemon-reload
systemctl enable --now "meeshy-ops@$ENV_NAME.path" "meeshy-ops-docker-df@$ENV_NAME.timer" ${BACKUP_TIMER:+"$BACKUP_TIMER"}

echo "relais installe pour $ENV_NAME :"
systemctl --no-pager --plain list-units "meeshy-ops@$ENV_NAME.path" "meeshy-ops-docker-df@$ENV_NAME.timer" ${BACKUP_TIMER:+"$BACKUP_TIMER"}
