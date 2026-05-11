# Coturn TLS via Traefik — Design (Cadrage A)

**Date** : 2026-05-11
**Branche** : `feat/coturn-tls-traefik`
**Statut** : Design — en attente de validation utilisateur avant `writing-plans`
**Issue source** : audit calls 2026-05-11 (`docs/audit-calls-2026-05-11.md`) — point relatif au port `5349/TLS` non opérationnel en production
**Cadrage retenu** : **A** — sidecar `traefik-certs-dumper` + TLS-ALPN-01 inchangé + router Traefik dummy pour `turn.meeshy.me` ; pay/login et migration DNS-01 wildcard restent en follow-up

---

## 1. Contexte et motivation

### 1.1 Pourquoi TURN over TLS

Le sous-système d'appels Meeshy (libwebrtc côté iOS et navigateur) chiffre déjà tout le payload media de bout en bout via **DTLS-SRTP** (RFC 8826/8827), indépendamment du transport ICE/TURN utilisé. Le serveur TURN ne voit que des octets opaques quand il relaie un media.

Le port `5349/TLS` (TURN over TLS) ne sert donc **pas** à protéger le media — celui-ci est déjà protégé. Il sert exclusivement à :

1. **Traverser les firewalls très restrictifs** (corporate, certains réseaux mobiles, certains pays) qui bloquent UDP et ne laissent passer que TCP/443-like. Sans `5349/TLS`, ces utilisateurs ne peuvent pas du tout passer d'appel.
2. **Réduire le profil réseau** : le trafic apparaît comme du TLS standard sortant, plus difficile à classifier comme « WebRTC » au niveau transport (le contenu reste déjà chiffré indépendamment).

Sans TURN/TLS, un sous-ensemble non négligeable d'utilisateurs (réseaux d'entreprise stricts, hotspots hôteliers, certains opérateurs mobiles) verra ses appels échouer silencieusement après le handshake ICE.

### 1.2 État actuel (audit du 2026-05-11)

En production sur `meeshy.me` :

- `infrastructure/config/turnserver.prod.conf:11-12` référence des fichiers de certificat à `/etc/letsencrypt/live/meeshy.me/fullchain.pem` et `privkey.pem`.
- `infrastructure/docker/compose/docker-compose.prod.yml:441` monte `/etc/letsencrypt:/etc/letsencrypt:ro` dans le container coturn.
- **Mais sur le serveur de prod**, le répertoire `/etc/letsencrypt/` n'existe pas ou est vide : les certificats Let's Encrypt sont gérés exclusivement par Traefik, qui les stocke dans `/letsencrypt/acme.json` (format JSON propriétaire ACME) au sein du volume Docker nommé `traefik_certs`.
- Conséquence : coturn démarre, log probablement une erreur de chargement des certificats, **ouvre le port 5349 mais le handshake TLS échoue**. Le port 3478 (plain UDP/TCP) reste fonctionnel.
- L'audit ne liste pas TLS coturn comme P0/P1/P2 explicite, mais c'est une brèche fonctionnelle qui dégrade silencieusement la traversée firewall.

DNS du sous-domaine `turn.meeshy.me` :

```
turn.meeshy.me. -> 157.230.15.51 (= IP du serveur principal, partagée avec meeshy.me et autres sous-domaines)
```

A-record correct, mais **aucun router Traefik** ne déclare actuellement `Host("turn.meeshy.me")` dans `docker-compose.prod.yml`, donc Let's Encrypt n'a jamais été sollicité pour émettre un certificat pour ce nom.

### 1.3 Pourquoi ne pas extraire `acme.json` directement par coturn

Trois raisons :

1. **Format incompatible** : coturn ne sait lire que des fichiers PEM standards (RFC 7468) sur disque, pas le JSON ACME de Traefik.
2. **Pas de mécanisme natif Traefik** : Traefik 3.x ne fournit aucun « post-issuance hook » qui écrirait des PEM. Le contenu de `acme.json` est destiné à un usage interne Traefik.
3. **Renouvellement** : Let's Encrypt expire les certificats tous les 90 jours, Traefik renouvelle aux alentours de 60 jours. Tout mécanisme qui copie le cert une seule fois échouera silencieusement à T+60j.

Il faut donc un composant qui surveille `acme.json` en continu, extrait les certificats en PEM dès qu'ils changent, et notifie coturn pour qu'il recharge sans downtime.

---

## 2. Options évaluées

Pour transparence, quatre options ont été considérées avant retenue du **Cadrage A**.

### Option A — Sidecar `traefik-certs-dumper` + TLS-ALPN-01 + router dummy turn *(RETENUE)*

Garder le challenge ACME Traefik tel quel (TLS-ALPN-01 sur port 443). Ajouter un router Traefik factice qui déclare `Host("turn.meeshy.me")` pour forcer l'émission du cert via les mêmes mécanismes que les autres sous-domaines. Ajouter le service `ldez/traefik-certs-dumper` qui surveille `/letsencrypt/acme.json` via `inotify`, extrait chaque cert dans un volume partagé, et exécute un hook post-extraction qui envoie `SIGUSR2` à coturn pour rechargement.

**Coût** : 1 service ajouté (~20 MB d'image alpine), ~30 lignes de YAML, aucun nouveau secret, aucun changement DNS provider.

### Option B — Sidecar `traefik-certs-dumper` + DNS-01 DigitalOcean + wildcard `*.meeshy.me` *(rejetée)*

Basculer le challenge ACME de Traefik vers DNS-01 (provider `digitalocean`), demander un certificat wildcard couvrant `meeshy.me` + `*.meeshy.me`. Le dumper extrait ce cert unique vers PEM. coturn lit le wildcard.

**Avantages** : couvre `turn.meeshy.me`, `pay.meeshy.me`, `login.meeshy.me` et tous les sous-domaines futurs en un seul cert ; pas de router dummy.

**Pourquoi rejetée pour ce spec** :
- Introduit un nouveau secret (Personal Access Token DigitalOcean avec scope `domain:write`) avec une rotation à gérer.
- Migration du mécanisme ACME Traefik en production : touche un composant aujourd'hui sain et stable, blast radius plus large que le seul changement coturn.
- L'objectif immédiat (résoudre TLS coturn ce matin) n'exige pas la couverture de `pay`/`login`, dont la nature reste à clarifier.

**Reste un follow-up viable** : si plus tard on veut simplifier la gestion des sous-domaines futurs et inclure pay/login dans la couverture, on bascule de A à B. Le sidecar dumper et le code coturn sont identiques dans les deux cas — seul change le contenu de `acme.json` (un cert wildcard vs un cert turn-specific).

### Option C — Extraction inline dans l'entrypoint coturn *(rejetée)*

Pas de nouveau service. L'entrypoint coturn existant (qui fait déjà un `sed` pour `__TURN_SECRET__`) est enrichi avec un `jq` pour extraire le cert depuis `acme.json` au démarrage, plus une boucle `while` interne pour la re-extraction quotidienne.

**Pourquoi rejetée** :
- Mélange logique ACME et logique TURN dans le même container, contre principe d'isolation.
- La logique d'extraction vit dans une string YAML inline — pas testable, pas commentable proprement, pas versionnée comme du vrai code.
- Race condition possible si Traefik renouvelle le cert pendant que coturn boote.
- `apk add jq` à chaque démarrage du container (l'image officielle coturn ne fournit pas `jq`).

### Option D — Script cron sur l'host + bind mount *(rejetée)*

Un cron systemd sur le serveur prod qui lit `acme.json` via `docker exec meeshy-traefik cat /letsencrypt/acme.json`, extrait les certs et écrit dans `/opt/meeshy/production/coturn-certs/`, bind-mounté dans coturn.

**Pourquoi rejetée** :
- Configuration qui vit en dehors du repo (cron host) — divergence repo/prod, non auditable via PR.
- Casse la philosophie « tout dans docker-compose ».
- Reload coturn nécessite encore un `docker exec` depuis le cron, complexifie sans bénéfice.

---

## 3. Décision retenue : Cadrage A

### 3.1 Principes

- Ne rien changer au challenge ACME existant de Traefik (`TLS-ALPN-01` reste actif).
- Forcer l'émission d'un cert Let's Encrypt pour `turn.meeshy.me` via un **router Traefik factice** qui ne route vers rien d'utile mais déclenche la demande ACME.
- Introduire **un seul service nouveau** : `certs-dumper` (image `ldez/traefik-certs-dumper`), dont la fonction est strictement contenue (watch + extract + post-hook).
- Modifier `coturn` uniquement pour pointer vers les PEM extraits par le dumper.
- Recharger coturn via `SIGUSR2` lors de chaque renouvellement (supporté nativement depuis coturn 4.5).

### 3.2 Hors-scope du présent spec

- `pay.meeshy.me`, `login.meeshy.me` : leurs A-records pointent déjà vers le serveur, mais aucun service ne tourne sur ces hôtes, et leur usage cible n'est pas clarifié. Ils seront traités dans une PR séparée — soit en les ajoutant comme routers Traefik (TLS-ALPN-01, même mécanisme que turn), soit en passant à un wildcard.
- Migration TLS-ALPN-01 → DNS-01 wildcard : voir Option B ci-dessus, follow-up à part.
- Ajout des URLs `turns:turn.meeshy.me:5349?transport=tcp` côté `services/gateway/src/services/TURNCredentialService.ts` et propagation iOS/web : nécessaire pour que les clients **utilisent** le port 5349, mais c'est un PR distinct (changement code applicatif). Le présent spec ne traite que l'infra.
- Monitoring spécifique des dates d'expiration coturn (Prometheus, alerting) : follow-up.

---

## 4. Architecture cible

```
┌───────────────────┐
│  Let's Encrypt    │
│  CA (ACME)        │
└────────┬──────────┘
         │ TLS-ALPN-01 challenge sur :443
         ▼
┌───────────────────┐
│  Traefik :80/:443 │   labels : Host(`turn.meeshy.me`)
│  (meeshy-traefik) │           tls.certresolver=letsencrypt
└────────┬──────────┘
         │ écrit / met à jour
         ▼
┌─────────────────────────────────────┐
│  volume traefik_certs               │
│  /letsencrypt/acme.json             │
└─────────────────────────┬───────────┘
                          │ mount RW
                          ▼
              ┌─────────────────────────┐
              │  certs-dumper           │
              │  (sidecar Traefik)      │
              │  inotify watch          │
              │  + post-extract hook    │
              └────────────┬────────────┘
                           │ écrit
                           ▼
              ┌──────────────────────────────────────────┐
              │  volume traefik_dumped_certs             │
              │  /dumped/certs/turn.meeshy.me.crt        │
              │  /dumped/private/turn.meeshy.me.key      │
              └────────────┬─────────────────────────────┘
                           │ mount RO (coturn observe via inotifywait
                           │  et s'auto-signale SIGUSR2 sur changement)
                           ▼
              ┌─────────────────────────┐
              │  coturn :3478 + :5349   │   network_mode: host
              │  (meeshy-coturn)        │
              └─────────────────────────┘
```

### Flow temporel

**T0 — déploiement initial** :
1. Compose démarre Traefik, le router dummy pour `turn.meeshy.me` apparaît.
2. Traefik tente le challenge TLS-ALPN-01 pour `turn.meeshy.me` → succès (DNS A record en place, port 443 occupé par Traefik).
3. Le cert est écrit dans `/letsencrypt/acme.json`.
4. `certs-dumper` détecte le changement de fichier via inotify, extrait `turn.meeshy.me.crt` (dans `/dumped/certs/`) et `turn.meeshy.me.key` (dans `/dumped/private/`).
5. Coturn démarre : son entrypoint patiente d'abord que les fichiers cert apparaissent (boucle d'attente bornée), puis lance `turnserver` ET un watcher `inotifywait` en arrière-plan sur son propre fichier cert.
6. Au premier démarrage, la boucle d'attente garantit qu'on ne lance `turnserver` qu'avec des certs valides. Si les certs prennent plus de 5min à apparaître, coturn fail-fast.

**T+59 jours — renouvellement Let's Encrypt** :
1. Traefik renouvelle automatiquement (logique ACME standard).
2. `acme.json` est ré-écrit.
3. `certs-dumper` re-déclenche son extraction → nouveaux PEM sur le volume partagé.
4. Le watcher `inotifywait` en arrière-plan dans coturn détecte la modification du `.crt` (event `close_write` ou `move`).
5. Le watcher envoie `pkill -USR2 turnserver` au PID local — coturn recharge le certificat sans interruption (pas d'arrêt des sessions TURN en cours).

**Inversion de contrôle** : le reload n'est pas piloté par un post-hook du dumper (qui ne peut pas faire `docker exec` car son image officielle ne contient pas le CLI Docker). Le dumper se contente d'écrire les PEM ; coturn observe ses propres fichiers cert et s'auto-signale. Bénéfices : aucun mount de `docker.sock`, dumper isolé sans privilèges, couplage minimal entre les deux services.

---

## 5. Composants à modifier

### 5.1 `infrastructure/docker/compose/docker-compose.prod.yml`

#### (a) Ajouter le router Traefik dummy pour `turn.meeshy.me`

Le router doit exister pour déclencher l'émission du cert via TLS-ALPN-01, mais il n'a pas besoin de router vers un vrai service. Solution propre : ajouter un service `noop` minimaliste (par exemple `nginx:alpine` qui sert une page vide) qui répond uniquement à `Host("turn.meeshy.me")`.

Alternative plus économe : ajouter les labels directement sur le service Traefik en utilisant le `api@internal` ou en pointant vers un service inexistant. **Choix retenu** : créer un container `turn-cert-stub` minimaliste pour rester explicite et auditable.

```yaml
  # ===========================================================================
  # TURN cert stub (déclenche émission Let's Encrypt pour turn.meeshy.me)
  # ===========================================================================
  turn-cert-stub:
    image: nginx:alpine
    container_name: meeshy-turn-cert-stub
    restart: unless-stopped
    networks:
      - meeshy-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.turn-cert-stub.rule=Host(`turn.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.turn-cert-stub.entrypoints=websecure"
      - "traefik.http.routers.turn-cert-stub.tls.certresolver=letsencrypt"
      - "traefik.http.services.turn-cert-stub.loadbalancer.server.port=80"
```

Note : ce container ne sert rien de fonctionnel ; il existe uniquement pour qu'un router Traefik réclame le cert. Une visite humaine vers `https://turn.meeshy.me/` retournera la page d'accueil nginx par défaut, ce qui est acceptable (le sous-domaine `turn` n'est pas une surface utilisateur). Si on veut être plus propre, on peut écraser `index.html` par une page 404 explicite.

#### (b) Ajouter le service `certs-dumper`

```yaml
  # ===========================================================================
  # CERTS DUMPER - Extrait acme.json en PEM (consommé par coturn)
  # ===========================================================================
  certs-dumper:
    image: ldez/traefik-certs-dumper:v2.8.6
    container_name: meeshy-certs-dumper
    restart: unless-stopped
    entrypoint:
      - traefik-certs-dumper
      - file
      - --version=v2
      - --watch
      - --source=/letsencrypt/acme.json
      - --dest=/dumped
    volumes:
      - traefik_certs:/letsencrypt:ro
      - traefik_dumped_certs:/dumped
    networks:
      - meeshy-network
    depends_on:
      traefik:
        condition: service_started
```

**Comportement** : `traefik-certs-dumper file --watch` lance un watcher `inotify` sur `acme.json`. Dès que Traefik réécrit le fichier (émission initiale ou renouvellement), le dumper extrait chaque cert dans `/dumped/certs/<domain>.crt` et chaque clé dans `/dumped/private/<domain>.key` (structure de sortie par défaut de `ldez/traefik-certs-dumper` v2). Aucun `--post-hook` : le reload coturn est piloté côté coturn (voir 5.1.d).

**Pas de mount `docker.sock`** : l'image officielle du dumper ne contient pas le CLI Docker, et on n'en a pas besoin puisque le reload est déclenché par coturn lui-même via `inotifywait` sur ses propres fichiers cert. Surface d'attaque du dumper minimale.

#### (c) Ajouter le volume `traefik_dumped_certs`

À ajouter dans la section `volumes:` en bas de `docker-compose.prod.yml` :

```yaml
volumes:
  traefik_dumped_certs:
    name: meeshy-traefik-dumped-certs
  # ... volumes existants ...
```

#### (d) Modifier le service `coturn`

```diff
   coturn:
     image: coturn/coturn:4.6
     container_name: meeshy-coturn
     network_mode: host
     volumes:
       - ../config/turnserver.prod.conf:/etc/turnserver.template.conf:ro
-      - /etc/letsencrypt:/etc/letsencrypt:ro
+      - traefik_dumped_certs:/etc/coturn/dumped:ro
     environment:
       - TURN_SECRET=${TURN_SECRET}
     entrypoint:
       - /bin/sh
       - -c
       - |
         set -e
         if [ -z "$$TURN_SECRET" ] || [ "$$TURN_SECRET" = "__TURN_SECRET__" ] || [ "$$TURN_SECRET" = "meeshy-turn-secret-CHANGE-IN-PRODUCTION" ]; then
           echo "[FATAL] TURN_SECRET env var must be set to a strong, non-default value before starting coturn." >&2
           exit 1
         fi
+
+        CERT_FILE=/etc/coturn/dumped/certs/turn.meeshy.me.crt
+        KEY_FILE=/etc/coturn/dumped/private/turn.meeshy.me.key
+
+        # 1) attendre que le dumper ait extrait les certs (bornage : 5min)
+        retry=0
+        while [ ! -f "$$CERT_FILE" ] || [ ! -f "$$KEY_FILE" ]; do
+          retry=$$((retry + 1))
+          if [ $$retry -gt 30 ]; then
+            echo "[FATAL] coturn cert files not present after 5min — dumper failure or first-issuance pending" >&2
+            exit 1
+          fi
+          echo "[coturn] waiting for cert files in /etc/coturn/dumped (try $$retry/30)"
+          sleep 10
+        done
+
+        # 2) installer inotify-tools (image coturn officielle = alpine)
+        apk add --no-cache inotify-tools >/dev/null 2>&1 || {
+          echo "[WARN] apk add inotify-tools failed — auto-reload désactivé, un restart manuel sera nécessaire au prochain renewal" >&2
+        }
+
+        # 3) watcher arrière-plan : SIGUSR2 self quand le .crt change
+        if command -v inotifywait >/dev/null 2>&1; then
+          (
+            while inotifywait -q -e close_write,move -- "$$CERT_FILE" >/dev/null; do
+              pkill -USR2 turnserver && echo "[coturn] cert changed, SIGUSR2 sent"
+            done
+          ) &
+        fi
+
         sed "s|__TURN_SECRET__|$$TURN_SECRET|g" /etc/turnserver.template.conf > /tmp/turnserver.conf
         exec turnserver -c /tmp/turnserver.conf
     restart: unless-stopped
     healthcheck:
       test: ["CMD", "turnutils_stunclient", "-p", "3478", "localhost"]
       interval: 30s
       timeout: 5s
       retries: 3
       start_period: 10s
+    depends_on:
+      certs-dumper:
+        condition: service_started
```

**Notes** :
- Le mount `traefik_dumped_certs:/etc/coturn/dumped:ro` donne accès en lecture seule aux deux sous-dossiers produits par le dumper : `/etc/coturn/dumped/certs/<domain>.crt` et `/etc/coturn/dumped/private/<domain>.key`.
- `apk add inotify-tools` est exécuté à chaque démarrage du container. Coût ~50 KB de download depuis le mirror Alpine, exécuté une seule fois par cycle de vie du container (coturn redémarre rarement). Alternative future : build une image coturn custom qui inclut déjà inotify-tools.
- Si l'install échoue (pas de réseau, mirror down), coturn démarre quand même et fonctionne — seul l'auto-reload au renewal est désactivé. Un message `[WARN]` apparaît dans les logs. Le renewal manuel reste possible via `docker restart meeshy-coturn` après mise à jour des certs.

### 5.2 `infrastructure/config/turnserver.prod.conf`

```diff
 listening-port=3478
 tls-listening-port=5349
 listening-ip=0.0.0.0
 listening-ip=::
 min-port=49152
 max-port=65535
 realm=meeshy.me
 server-name=turn.meeshy.me
 use-auth-secret
 static-auth-secret=__TURN_SECRET__
-cert=/etc/letsencrypt/live/meeshy.me/fullchain.pem
-pkey=/etc/letsencrypt/live/meeshy.me/privkey.pem
+cert=/etc/coturn/dumped/certs/turn.meeshy.me.crt
+pkey=/etc/coturn/dumped/private/turn.meeshy.me.key
 no-multicast-peers
 ...
```

Les chemins correspondent à la structure de sortie de `ldez/traefik-certs-dumper` v2 : un dossier `certs/` pour les certificats publics et un dossier `private/` pour les clés privées, avec `<domain>.crt` / `<domain>.key` comme nom de fichier.

### 5.3 Pas de modification côté code application

Pour ce spec, on ne touche **pas** :
- `services/gateway/src/services/TURNCredentialService.ts` (ajout des URLs `turns:` = follow-up séparé)
- `apps/ios/Meeshy/Features/Calls/**` (consommation des URLs côté client = follow-up séparé)
- `apps/web/**` (idem)
- Pas de migration Prisma, pas de changement de schéma

L'objectif est d'ouvrir le port `5349/TLS` côté infra. L'utilisation effective par les clients sera l'objet d'une PR ultérieure qui pourra réutiliser cette infra sans modification.

---

## 6. Mécanisme de renewal

### 6.1 Renouvellement Let's Encrypt

Traefik renouvelle automatiquement les certs Let's Encrypt à ~T-30j de l'expiration (T+60j après émission). Cette logique est inchangée : le présent spec ne touche pas la mécanique ACME de Traefik.

### 6.2 Détection par `certs-dumper`

Le flag `--watch` lance un watcher `inotify` sur `acme.json`. Dès que Traefik réécrit le fichier (renouvellement réussi), le dumper :
1. Parse le JSON.
2. Compare le hash des certs déjà extraits avec ceux dans `acme.json`.
3. Si différent, réécrit les PEM correspondants.
4. Exécute `--post-hook` si fourni.

Si `acme.json` n'a pas changé (pas de renouvellement), le watcher reste silencieux.

### 6.3 Reload coturn via SIGUSR2 (auto-déclenché côté coturn)

Depuis coturn 4.5.0, `SIGUSR2` recharge le certificat TLS sans interrompre les sessions en cours (voir [coturn changelog 4.5.0](https://github.com/coturn/coturn/blob/master/ChangeLog)).

Mécanisme : un watcher `inotifywait` tourne en arrière-plan dans le container coturn (lancé depuis l'entrypoint), observant le fichier `.crt` du dumper. Les events surveillés sont `close_write` (cas standard : le dumper finit d'écrire) et `move` (cas atomique : le dumper écrit dans un tmp puis renomme). Sur tout event, `pkill -USR2 turnserver` est envoyé au PID local du `turnserver`.

Avantages :
- Pas de mount `docker.sock` dans le dumper, pas de couplage Docker-API entre les services.
- Le watcher tourne dans le PID namespace de coturn, donc `pkill` cible le bon processus sans ambiguïté.
- Si coturn redémarre, le watcher est relancé par l'entrypoint — pas de fuite.

### 6.4 Failure modes du renewal

| Scénario | Comportement | Mitigation |
|---|---|---|
| Traefik échoue à renouveler (DNS A record retiré, port 443 indisponible, rate limit Let's Encrypt) | `acme.json` non mis à jour → cert continue d'expirer | Alerte standard Traefik dans les logs. Follow-up : monitoring Prometheus expiration |
| `acme.json` réécrit mais cert turn absent (suppression manuelle du router stub) | Dumper continue d'écrire les autres certs ; le fichier `turn.meeshy.me.crt` ne change pas → cert expire | Tester avant deploy que le router stub a bien généré le cert. Surveiller le fichier extrait |
| `inotifywait` non disponible (apk add a échoué au boot) | Watcher non lancé → pas d'auto-reload. coturn sert l'ancien cert (toujours valide 30j si renewal à T-30j), restart manuel nécessaire | Log `[WARN] apk add inotify-tools failed` visible au boot. Follow-up : image coturn custom avec inotify-tools pré-installé |
| Watcher meurt silencieusement (kill, OOM container partiel) | Pas d'auto-reload jusqu'au prochain restart container | Acceptable : coturn restart régulier sur deploy de la stack. Pour gros downtime, monitoring expiration cert détecte en amont |
| Coturn boote avant que le dumper ait extrait les certs (race au premier deploy) | Boucle d'attente 30×10s dans l'entrypoint coturn — fail si pas de cert après 5min | Premier déploiement : laisser Traefik faire son challenge ACME (~30s) AVANT de démarrer coturn. `depends_on: certs-dumper` aide. Si toujours fail, redémarrage manuel après Traefik OK |

---

## 7. Tests d'acceptation

### 7.1 Pré-déploiement (smoke local — si possible)

Difficile à valider entièrement en local : Let's Encrypt staging exige une vraie résolution DNS et un port 443 atteignable depuis Internet. On se limite à :

- [ ] `docker-compose -f docker-compose.prod.yml config` valide la syntaxe (aucune erreur YAML).
- [ ] Image `ldez/traefik-certs-dumper:v2.8.6` est pullable depuis Docker Hub.
- [ ] Le service `turn-cert-stub` démarre seul sans erreur (`docker-compose up turn-cert-stub` en isolation).

### 7.2 Post-déploiement sur production

Une fois déployé sur `meeshy.me` :

- [ ] **Cert présent dans acme.json** :
  ```bash
  ssh root@meeshy.me 'docker exec meeshy-traefik cat /letsencrypt/acme.json | jq ".letsencrypt.Certificates[].domain.main"'
  ```
  Doit lister `turn.meeshy.me` parmi les autres.

- [ ] **PEM extraits par le dumper** :
  ```bash
  ssh root@meeshy.me '
    docker exec meeshy-certs-dumper ls -la /dumped/certs/ && \
    docker exec meeshy-certs-dumper ls -la /dumped/private/
  '
  ```
  Doit afficher `turn.meeshy.me.crt` dans `certs/` et `turn.meeshy.me.key` dans `private/`.

- [ ] **Coturn a lu les certs** :
  ```bash
  ssh root@meeshy.me 'docker logs meeshy-coturn 2>&1 | grep -iE "cert|tls" | tail -20'
  ```
  Doit montrer `Loaded cert file` / `Loaded private key file` sans erreur.

- [ ] **Handshake TLS sur 5349 fonctionne** :
  ```bash
  echo | openssl s_client -connect turn.meeshy.me:5349 -servername turn.meeshy.me 2>&1 | head -20
  ```
  Doit retourner un cert Let's Encrypt valide avec `CN=turn.meeshy.me` ou `subjectAltName` matching, et pas de `verify error`.

- [ ] **TURN client TLS** (vraie validation fonctionnelle) :
  ```bash
  # depuis une machine externe avec coturn-utils installé
  turnutils_uclient -t -T -p 5349 -u <user> -w <hmac-from-gateway> turn.meeshy.me
  ```
  Doit établir un allocate TURN sur 5349/TCP+TLS.

- [ ] **Healthcheck coturn vert** :
  ```bash
  ssh root@meeshy.me 'docker ps --filter name=meeshy-coturn --format "{{.Status}}"'
  ```
  Doit afficher `(healthy)` après ~40s.

### 7.3 Test de renewal (simulation)

Difficile à provoquer à la demande sans attendre 60 jours. Trois approches :

- **(a) Test passif** : surveiller les logs `certs-dumper` lors du prochain renewal Traefik (environ J+60).
- **(b) Test actif léger** : forcer Traefik à demander un nouveau cert en supprimant l'entrée correspondante de `acme.json` (très intrusif, à faire uniquement en staging si disponible).
- **(c) Test du watcher coturn isolé** : `touch` du fichier `.crt` côté volume pour simuler une modif sans toucher acme.json, puis vérifier que coturn a déclenché son SIGUSR2 :
  ```bash
  ssh root@meeshy.me '
    docker exec meeshy-coturn sh -c "touch /etc/coturn/dumped/certs/turn.meeshy.me.crt"
    sleep 2
    docker logs meeshy-coturn --tail 10
  '
  ```
  Note : le `touch` depuis le container coturn fonctionne uniquement si le mount est en RW. Comme on l'a en RO (`:ro`), il faut soit faire le touch depuis le container `certs-dumper` (qui a le mount RW), soit accepter ce test comme indisponible et valider seulement via test passif (a).

- **(d) Test du watcher via dumper** :
  ```bash
  ssh root@meeshy.me '
    docker exec meeshy-certs-dumper sh -c "touch /dumped/certs/turn.meeshy.me.crt"
    sleep 2
    docker logs meeshy-coturn --tail 10
  '
  ```
  Doit montrer un message coturn type `cert changed, SIGUSR2 sent` puis `Reloading certificates`.

Pour ce spec, on retient **(a) test passif + (d) test du watcher** comme acceptables.

---

## 8. Risques et mitigations

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Premier challenge TLS-ALPN-01 pour turn.meeshy.me échoue (DNS lent à propager, rate limit Let's Encrypt) | faible | déploiement TLS coturn raté → port 5349 inopérant | Vérifier `dig turn.meeshy.me` avant deploy. Si rate limit, Let's Encrypt rate limit reset toutes les 168h. Fallback : laisser tourner avec 5349 désactivé temporairement |
| R2 | `traefik-certs-dumper` a accès lecture à `acme.json` qui contient les clés privées de **tous** les sous-domaines (gate, mongo, redis, etc.), pas seulement turn | certain (by design) | escalade : si dumper compromis, exfiltration des clés privées de toute l'infra TLS | Image officielle `ldez/traefik-certs-dumper` est largement utilisée et reviewable. Aucun port exposé sur le dumper. Pas d'accès réseau public. Monter `acme.json` en `:ro`. Pas de mount `docker.sock` (couplage minimal) |
| R3 | Le router `turn-cert-stub` expose un nginx public sur `https://turn.meeshy.me/` qui sert une page nginx par défaut | certain | divulgation mineure (version nginx) ; pas de leak de données | Écraser `index.html` par une page minimaliste type 404 ou redirect vers `meeshy.me`. Ajouter middleware Traefik `secure-headers` pour cacher `Server: nginx` |
| R4 | Race condition : coturn démarre avant que le dumper ait extrait les certs (cold start) | moyenne au premier deploy, faible ensuite | coturn ne démarre pas → 3478 et 5349 KO | Boucle d'attente 30×10s dans l'entrypoint. `depends_on: certs-dumper`. Au pire, manual restart après vérif |
| R5 | `apk add inotify-tools` échoue (réseau down, mirror Alpine inaccessible au boot coturn) | très faible | watcher non lancé → pas d'auto-reload au prochain renewal. Restart manuel coturn nécessaire à J+60 | Log `[WARN]` visible au boot. Follow-up : image coturn custom avec inotify-tools pré-installé pour éliminer la dépendance réseau au boot |
| R6 | `SIGUSR2` envoyé au mauvais processus si coturn fork des workers | faible | un seul worker recharge, les autres servent l'ancien cert | `pkill -USR2 turnserver` cible **tous** les processus matchant. coturn 4.6 single-process par défaut |
| R7 | `inotifywait` rate l'event (filesystem overlay, atomicité de l'écriture dumper) | faible | pas de reload sur ce renewal | Le dumper utilise probablement un write + rename atomique. On surveille `close_write` ET `move` côté coturn, couvre les deux cas. Si vraiment raté, le restart suivant lira le nouveau cert |
| R8 | Le sous-domaine `turn.meeshy.me` se retrouve indexé publiquement (HSTS preload, robots) | faible | bruit SEO mineur | Ajouter `X-Robots-Tag: noindex` via middleware Traefik. Ou désactiver explicitement HSTS sur ce router |
| R9 | Renouvellement Let's Encrypt rate-limité (50 certs/semaine/registered domain) | très faible | turn ne pourra pas se renewer si on a déjà beaucoup de certs sur `meeshy.me` | On a actuellement 10 certs, marge confortable. Migration vers wildcard (Option B en follow-up) résout définitivement |

---

## 9. Hors-scope explicites / Follow-ups

Ces points sont **identifiés mais hors du présent spec** et seront traités séparément :

1. **`pay.meeshy.me` / `login.meeshy.me`** : leurs A-records pointent vers le serveur principal, mais aucun service n'écoute. Quand leur usage sera clarifié (frontends Stripe-checkout / WorkOS / Auth0 / ou services Meeshy internes), ils auront leur propre router Traefik (ou seront migrés vers un wildcard).
2. **Migration TLS-ALPN-01 → DNS-01 wildcard `*.meeshy.me`** : Option B évaluée. À reconsidérer si on multiplie les sous-domaines ou si on veut éliminer le besoin de routers stub. Prérequis : créer un PAT DigitalOcean avec scope `domain:write` et le stocker dans `.env` prod.
3. **Code applicatif `turns:` URL côté clients** : `services/gateway/src/services/TURNCredentialService.ts:78` produit aujourd'hui uniquement `turn:turn.meeshy.me:3478`. Ajouter `turns:turn.meeshy.me:5349?transport=tcp` quand le port 5349 sera confirmé opérationnel. Propagation côté iOS (`MessageSocketManager`) et web automatique via le payload `iceServers`.
4. **Monitoring expiration cert TURN** : exporteur Prometheus type `blackbox-exporter` avec `tcp` module + check TLS certificate expiry sur `turn.meeshy.me:5349`. Alerting Grafana à T-14j.
5. **Image coturn custom avec inotify-tools pré-installé** : élimine le `apk add` au boot et la dépendance réseau au démarrage. Dockerfile court (`FROM coturn/coturn:4.6` + `RUN apk add inotify-tools`), build dans le CI Meeshy.
6. **Nettoyage du router `turn-cert-stub`** : si on bascule un jour sur DNS-01 wildcard (Option B), ce service devient inutile et peut être supprimé.

---

## 10. Plan de déploiement (résumé — détails dans le plan d'implémentation)

1. **Branche** : `feat/coturn-tls-traefik` depuis `main`.
2. **Modifications repo** :
   - `infrastructure/docker/compose/docker-compose.prod.yml` (3 services modifiés + 1 ajout volume)
   - `infrastructure/config/turnserver.prod.conf` (2 lignes cert/pkey)
3. **Préparation prod** :
   - Vérifier `/opt/meeshy/production/docker-compose.yml` côté serveur ; rappel : ce fichier diffère du repo et doit être mis à jour manuellement (cf. MEMORY.md).
   - Pas de nouveau secret à créer.
4. **Déploiement** :
   - `git pull origin feat/coturn-tls-traefik` sur le serveur (ou copie manuelle).
   - `docker-compose pull` (pour `ldez/traefik-certs-dumper`).
   - `docker-compose up -d turn-cert-stub certs-dumper` (avant coturn).
   - Vérifier que le challenge ACME a réussi (logs Traefik).
   - `docker-compose up -d coturn` (recreate avec le nouveau mount).
5. **Validation** : exécuter la check-list de 7.2.
6. **Rollback** :
   - Revert simple : `git checkout main -- infrastructure/docker/compose/docker-compose.prod.yml infrastructure/config/turnserver.prod.conf` puis `docker-compose up -d --force-recreate coturn`.
   - Pas de migration DB, pas de changement de schéma, donc rollback trivial.

Le détail des commandes et l'ordre exact seront produits par `writing-plans` après validation du présent spec.

---

## 11. Références

- Code actuel :
  - `infrastructure/config/turnserver.prod.conf:1-28`
  - `infrastructure/docker/compose/docker-compose.prod.yml:435-460` (service coturn)
  - `infrastructure/docker/compose/docker-compose.prod.yml:21-61` (service traefik)
  - `services/gateway/src/services/TURNCredentialService.ts` (logique HMAC TURN)
- Documentation :
  - `docs/audit-calls-2026-05-11.md` (audit de référence)
  - `infrastructure/CLAUDE.md` (conventions Docker Meeshy)
  - [traefik-certs-dumper documentation](https://github.com/ldez/traefik-certs-dumper) — voir `--dest` et structure de sortie `certs/` + `private/`
  - [coturn SIGUSR2 changelog 4.5](https://github.com/coturn/coturn/blob/master/ChangeLog)
  - [inotify-tools `inotifywait`](https://github.com/inotify-tools/inotify-tools/wiki) — events `close_write` et `move`
  - [RFC 8826 — SRTP-DTLS Key Transport](https://datatracker.ietf.org/doc/html/rfc8826)
  - [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — 50 certs/semaine/registered domain
- Mémoire / contexte projet :
  - Memory : `project_calls_subsystem_2026_05.md` (statut PRs #226/#227/#228)
  - Memory : `feedback_no_coauthor_in_commits.md` (style commit)
