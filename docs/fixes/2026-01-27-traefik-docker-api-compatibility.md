# Fix: 404 sur meeshy.me - Incompatibilité API Docker Traefik

**Date**: 2026-01-27
**Statut**: ✅ Résolu

## Symptôme

Après redémarrage des applications sur `root@meeshy.me`, le site https://meeshy.me/ retournait une erreur 404.

## Cause Racine

Traefik v3.3 utilisait une ancienne version du client Docker API (1.24) incompatible avec l'API Docker moderne du serveur (1.53).

**Erreur dans les logs:**
```
Failed to retrieve information of the docker client and server host
error="Error response from daemon: client version 1.24 is too old.
Minimum supported API version is 1.44"
```

**Conséquence:** Traefik ne pouvait pas lire les labels Docker des conteneurs pour configurer le routing, résultant en 404 pour toutes les requêtes.

## Solution Appliquée

Mise à jour de Traefik v3.3 → v3.6 sur le serveur de production:

```bash
# Sur le serveur root@meeshy.me
cd /opt/meeshy/production
sed -i 's/image: traefik:v3.3/image: traefik:v3.6/' docker-compose.yml
docker compose pull traefik
docker compose up -d traefik
```

## Vérification

Tous les services fonctionnent correctement:
- ✅ https://meeshy.me/ → HTTP 200
- ✅ https://www.meeshy.me/ → HTTP 200
- ✅ https://gate.meeshy.me/health → HTTP 200
- ✅ https://ml.meeshy.me/health → HTTP 200
- ✅ https://static.meeshy.me/health → HTTP 200

## Prévention Future

Le repo local (`infrastructure/docker/compose/docker-compose.prod.yml`) contient déjà `traefik:v3.6`. Pour éviter ce problème:

1. Toujours utiliser le docker-compose du repo pour les déploiements
2. Vérifier que la version de Traefik sur le serveur correspond au repo
3. Mettre à jour régulièrement Traefik pour maintenir la compatibilité avec Docker

## Références

- Docker-compose local: `infrastructure/docker/compose/docker-compose.prod.yml:22`
- Version API Docker serveur: 1.53
- Version API Docker requise par Traefik: ≥ 1.44
- Traefik v3.6 release notes: https://github.com/traefik/traefik/releases/tag/v3.6.0
