# La webapp se configure au démarrage du conteneur (#10208)

L'image `isopen/meeshy-webapp` est **la même** pour le staging, la production et tout déploiement sur site. Aucune origine n'est figée au build : le conteneur la reçoit au démarrage.

## Les variables

| Variable | Rôle | Exemple |
|---|---|---|
| `MEESHY_API_URL` | la passerelle (HTTP et socket) | `https://api.acme.fr`, `http://10.0.0.5:3000` |
| `MEESHY_WEB_URL` | l'origine publique des liens partagés | `https://chat.acme.fr` |

Les deux sont facultatives. Une valeur **présente mais invalide arrête le démarrage**, par exemple :
- un schéma autre que http(s) ;
- des identifiants dans l'URL ;
- une requête (`?…`) ;
- un guillemet.

Un conteneur qui ignorerait sa configuration servirait une application branchée ailleurs.

`apps/web/docker/runtime-config.sh` les écrit dans `/config.js` (`window.__MEESHY_RUNTIME__`) et le journal du conteneur les affiche.

## Sans déclaration : l'hôte de la page

| La page est servie sur | La passerelle attendue |
|---|---|
| `meeshy.me`, `www.meeshy.me` | `https://gate.meeshy.me` |
| `staging.meeshy.me` | `https://gate.staging.meeshy.me` |
| `chat.acme.fr:8443` | `https://gate.chat.acme.fr:8443` (protocole et port gardés) |
| `10.0.0.5:3400`, `localhost`, un nom sans point | `http://<même hôte>:3000` |

Un déploiement qui ne suit pas la convention `gate.<hôte>` déclare `MEESHY_API_URL`.

## Ordre de résolution (`apps/web/src/lib/api/config.ts`)

1. `MEESHY_API_URL` (démarrage).
2. `VITE_API_BASE` (build) : sert les images anciennes et les coques.
3. Le proxy Vite, en développement.
4. L'hôte de la page.
5. La production.

La coque Capacitor ignore la configuration de démarrage : son origine est celle de son build.

## Exemple sur site

```yaml
  frontend:
    image: isopen/meeshy-webapp:latest
    environment:
      - MEESHY_API_URL=https://api.acme.fr
      - MEESHY_WEB_URL=https://chat.acme.fr
```

Côté passerelle, l'origine du site doit être autorisée par CORS : `CORS_ORIGINS=https://chat.acme.fr` (`services/gateway/src/config/cors-origins.ts`).

## Service worker

`/config.js` n'est **pas** précaché. Il est servi en stale-while-revalidate (seau `deployment-config`) et nginx le sert en `no-cache`. Une origine changée au redémarrage du conteneur s'applique donc au lancement suivant d'une PWA installée.
