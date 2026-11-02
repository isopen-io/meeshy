## Un appel passe derrière un pare-feu qui n'ouvre que le 443 (2026-10-22, #11278)

### Contexte

Un pare-feu d'entreprise, d'hôtel ou de réseau invité laisse souvent sortir le web (443) et rien d'autre. Le relais TURN de Meeshy écoute sur 3478 (UDP/TCP) et 5349 (TLS). Derrière un tel pare-feu, aucun candidat ICE ne s'établit et l'appel échoue. Le staging, lui, n'avait aucun coturn (`TURN_SERVERS` vide) : il ne relayait rien du tout.

### Décision

1. **La passerelle annonce des relais TLS à nom et port libres** : `TURN_TLS_SERVERS=hôte[:port],…` (443 par défaut) ajoute `turns:<hôte>:<port>?transport=tcp`, avec les MÊMES identifiants éphémères, EN PLUS des `turn:` et des `turns:` dérivés de `TURN_SERVERS × TURN_TLS_PORT`. Les doublons sont écartés. Une entrée illisible est écartée et journalisée, jamais réparée. Variable absente : la liste ne change pas. Source : `services/turn-tls-servers.ts`, appelée par `TURNCredentialService`.
2. **Le 443 est servi par le Traefik partagé, qui TERMINE le TLS** : un routeur TCP `HostSNI(turn.staging.<domaine>)` sur `websecure`, avec le certificat Let's Encrypt de Traefik, relaie du TURN-sur-TCP en clair vers le `listening-port` de coturn. coturn n'a ni certificat ni clé : aucun secret de la production n'est monté dans le conteneur de staging, et rien n'est en *passthrough*. Les routeurs HTTP de `websecure` ne sont pas touchés, puisqu'un routeur TCP ne capte que son propre nom SNI. Traefik répond lui-même au défi ACME TLS-ALPN avant tout routage TCP.
3. **Le staging a son coturn (`coturn-staging`), en bridge** : la production tient en réseau hôte 3478, 3479, 5349 et toute la plage 49152-65535 du même serveur (#9232). Le staging publie 3480 (UDP/TCP) et le relais 40000-40099/udp. Son secret est le `TURN_SECRET` de son `.env`, celui que signe `gateway-staging`. `TURN_EXTERNAL_IP` est exigée, sinon coturn annoncerait l'adresse de son conteneur comme relais. Le staging n'annonce pas de 5349 (`TURN_TLS_PORT=0`).

### Alternatives écartées

- **Une IP secondaire sur laquelle coturn écoute en TLS sur 443** : le serveur n'en a pas qu'on connaisse, et l'hôte partagé exige une décision d'infrastructure.
- **Un *passthrough* SNI vers le 5349 de coturn** : il obligerait à monter un certificat dans coturn. Le seul magasin existant (`traefik_dumped_certs`) contient les clés privées de TOUS les domaines de la production. Il obligerait aussi à joindre un conteneur en réseau hôte depuis Traefik, ce qui suppose de modifier le Traefik de la production (`host.docker.internal`).

### Conséquences

- La production ne change pas tant que le porteur n'a pas donné son feu vert : sa passerelle ne déclare pas `TURN_TLS_SERVERS`, ce que garde `staging-turn-over-443.test.ts`.
- coturn voit l'adresse de Traefik, et non celle du client, pour les relais pris sur le 443 (pas de PROXY protocol dans coturn 4.6). Les quotas par client valent donc pour l'ensemble des appels arrivés par le 443.
- Démarrage manuel du staging : DNS `turn.staging.<domaine>`, pare-feu de l'hôte ouvert, `TURN_EXTERNAL_IP` posée dans le `.env`, puis `docker compose up -d coturn-staging gateway-staging`. Vérification : `chrome://webrtc-internals`, candidat local `relay` avec `relayProtocol=tls` et `url` en `turns:…:443`, sous `iceTransportPolicy: 'relay'`.
