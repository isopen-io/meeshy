# Journaux : où ils vivent, combien de temps (#10855)

Un seul Traefik sert la production ET le staging (`meeshy-traefik`, compose de
production) : son journal d'accès couvre les deux, distingués par `RouterName`
(`gateway@docker`, `gateway-staging@docker`…).

| journal | où | rotation | conservé |
|---|---|---|---|
| accès Traefik | `/var/log/meeshy/traefik/access.log` (JSON, une requête par ligne) | logrotate quotidien (`/etc/logrotate.d/meeshy-traefik`), 00:00 UTC | 14 jours, `access.log-AAAAMMJJ.gz` |
| passerelle, translator, webapp, agent (prod et staging) | journald (`logging: driver: journald`) | journald | 30 jours au plus, 4 Go au plus (`/etc/systemd/journald.conf.d/meeshy-retention.conf`) |
| autres conteneurs (base, Redis, coturn…) | json-file Docker (`/etc/docker/daemon.json`) | 10 Mo × 3 | inchangé |

## Lire

```bash
# accès : erreurs 5xx de la passerelle de production sur 7 jours
zcat -f /var/log/meeshy/traefik/access.log-*.gz /var/log/meeshy/traefik/access.log \
  | jq -c 'select(.RouterName=="gateway@docker" and .DownstreamStatus>=500)
           | {StartUTC, RequestMethod, RequestPath, DownstreamStatus, Duration}'

# passerelle de production sur 7 jours (survit aux recréations du conteneur)
journalctl CONTAINER_NAME=meeshy-gateway --since "7 days ago" -o cat
journalctl CONTAINER_NAME=meeshy-gateway-staging --since "1 hour ago" -o cat
```

`docker logs` fonctionne toujours (cache local du démon), mais ne voit que le
conteneur courant ; journald garde les conteneurs précédents.

## Ce qui est journalisé, et ce qui ne l'est pas

- Traefik garde tous les champs sauf `StartLocal` (doublon) et `ClientUsername`.
- **Aucun en-tête n'est journalisé, sauf `User-Agent`** (version du client,
  utile au diagnostic) : `Authorization`, `Cookie`, `X-Session-Token`, `Referer`
  restent hors du fichier. Aucun corps de requête.
- Depuis #10859, les liens d'e-mail portent leur jeton dans le FRAGMENT
  (`…?via=email#token=…`), que le navigateur n'envoie jamais : il n'atteint
  plus aucun journal. Les e-mails partis avant portent encore `?token=…`
  (lien magique, réinitialisation, vérification, avec `&email=…`). Le compresseur
  `/usr/local/sbin/meeshy-accesslog-redact-gzip`
  (`infrastructure/scripts/accesslog-redact-gzip.sh`, témoin
  `accesslog-redact-gzip.test.sh`) en masque la valeur à la rotation : le
  fichier du jour courant les contient encore, au plus 24 h, et ces jetons sont
  à usage unique et de courte durée.
- Les adresses IP sont des données personnelles : finalité sécurité et
  diagnostic d'incident, 14 jours pour l'accès, 30 jours au plus pour les
  journaux applicatifs.

## Empreinte disque (mesurée le 2026-10-16)

- Accès : ~800 octets par requête, ~200 000 requêtes/jour au plus ⇒ ~160 Mo
  bruts pour le jour courant, ~10 Mo/jour compressés ⇒ ~300 Mo à l'équilibre.
- Applicatifs : passerelle ~14 Mo/jour, webapp ~10, translator ~5, agent ~2
  (production) ; journald plafonné à 4 Go et laisse toujours 20 Go libres.
- Disque : 388 Go, 163 Go libres.

## Installer ou réinstaller

```bash
install -m 0755 infrastructure/scripts/accesslog-redact-gzip.sh /usr/local/sbin/meeshy-accesslog-redact-gzip
install -m 0644 infrastructure/config/logging/logrotate-meeshy-traefik /etc/logrotate.d/meeshy-traefik
install -m 0644 infrastructure/config/logging/journald-meeshy-retention.conf /etc/systemd/journald.conf.d/meeshy-retention.conf
install -d -m 0750 -o root -g adm /var/log/meeshy/traefik
systemctl restart systemd-journald
logrotate -d /etc/logrotate.d/meeshy-traefik      # la rotation est armée
```

Le compose du serveur diverge du dépôt : patch chirurgical (les drapeaux
`--accesslog.*`, le montage `/var/log/meeshy/traefik:/var/log/traefik`, le bloc
`logging:` des quatre services), sauvegarde `docker-compose.yml.bak-<date>-before-10855`.
Traefik se recrée seul (`docker compose up -d --no-deps traefik`, ~2,5 s sans
entrée) ; les services applicatifs prennent journald à leur prochaine
recréation (promotion), jamais par un redémarrage dédié en production.

## Retour arrière

```bash
cd /opt/meeshy/production
cp docker-compose.yml.bak-<date>-before-10855 docker-compose.yml
docker compose up -d --no-deps traefik
rm /etc/logrotate.d/meeshy-traefik   # les .gz restants s'effacent à la main
```

Le staging se rétablit de la même façon depuis son propre `.bak` puis
`docker compose up -d --no-deps gateway-staging translator-staging frontend-staging agent-staging`.
