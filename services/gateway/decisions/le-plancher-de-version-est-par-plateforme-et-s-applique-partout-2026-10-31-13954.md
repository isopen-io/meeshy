## Le plancher de version est par plateforme et s'applique à la session, au socket et aux cercles (2026-10-31, #13954)

**Constat** : D-5 (#13947) retire toute compatibilité ascendante pour les cercles. Le plancher existant (`MIN_APP_VERSION`, `isBelowFloor`) ne jugeait que la création de scène (`routes/posts/core.ts`) et n'était qu'un numéro unique, alors qu'iOS est en 1.1.x, Android en 3.0.x et le web en 2.0.x.

**Décision** :
- Un plancher PAR plateforme : `MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`, repli sur `MIN_APP_VERSION` (`getAppVersionFloorFor`). Web, PWA et coque Capacitor ne sont jamais jugés. Tous vides (défaut) : porte désarmée. Le déploiement arme le plancher, jamais ce lot.
- UN contrôle, `middleware/app-version-floor.ts`, lu par : le middleware d'authentification REST (juste après l'admission de session, y compris sur une route à authentification facultative), le handshake socket (avant l'admission, refus en bande `error` { `code: UPGRADE_REQUIRED`, `minVersion`, `storeUrl` } puis fermeture), le `preHandler` `appVersionFloorPreHandler` des routes de cercles, et la porte des stories.
- La socket lit la plateforme BRUTE de `handshake.auth.client` : `readClientSessionAuth` écarte `android` (hors `CLIENT_PLATFORMS`, réservé à la coque), ce qui aurait jugé l'application native sur le plancher global.
- `GET /app/min-version?platform=` sert le plancher de la plateforme ; sans paramètre, `minVersion` global inchangé.
- En-tête de version absent : jamais bloqué (le web).

**Hors périmètre, dit** : l'admission anonyme (`X-Session-Token`) et le handler tus ne sont pas jugés (les cercles sont réservés aux comptes) ; ouvrir une issue si le plancher doit aussi y courir.
