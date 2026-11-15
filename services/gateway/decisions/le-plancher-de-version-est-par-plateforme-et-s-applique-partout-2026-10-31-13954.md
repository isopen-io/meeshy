## Le plancher de version est par plateforme et s'applique à la session, au socket et aux cercles (2026-10-31, #13954)

**Constat** : D-5 (#13947) retire toute compatibilité ascendante pour les cercles. Le plancher existant (`MIN_APP_VERSION`, `isBelowFloor`) ne jugeait que la création de scène (`routes/posts/core.ts`) et n'était qu'un numéro unique, alors qu'iOS est en 1.1.x, Android en 3.0.x et le web en 2.0.x.

**Décision** :
- Un plancher PAR plateforme : `MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`, repli sur `MIN_APP_VERSION` (`getAppVersionFloorFor`). Web, PWA et coque Capacitor ne sont jamais jugés. Tous vides (défaut) : porte désarmée. Le déploiement arme le plancher, jamais ce lot.
- UN contrôle, `middleware/app-version-floor.ts`, lu par : le middleware d'authentification REST (juste après l'admission de session, y compris sur une route à authentification facultative), le handshake socket (avant l'admission, refus en bande `error` { `code: UPGRADE_REQUIRED`, `minVersion`, `storeUrl` } puis fermeture), le `preHandler` `appVersionFloorPreHandler` des routes de cercles, et la porte des stories.
- La socket lit la plateforme BRUTE de `handshake.auth.client` : `readClientSessionAuth` écarte `android` (hors `CLIENT_PLATFORMS`, réservé à la coque), ce qui aurait jugé l'application native sur le plancher global.
- `GET /app/min-version?platform=` sert le plancher de la plateforme ; sans paramètre, il lit `X-App-Platform` (le binaire natif reçoit le plancher qui le juge, sinon son démarrage dirait « à jour » pendant que chaque requête rend 426) ; ni l'un ni l'autre (le web) : `minVersion` global inchangé.
- En-tête de version absent : jamais bloqué (le web).
- Le relevé de session (`X-Meeshy-Version`, `handshake.auth.client.appVersion`) est AUSSI posé par le web, qui y déclare sa 2.0.x, parfois sans plateforme. Il ne juge donc qu'une plateforme NATIVE déclarée (`ios`, `android`) ; seul `X-App-Version`, posé par les seuls binaires natifs, garde le repli global quand la plateforme manque (comportement historique de la porte des stories).

**Hors périmètre, dit** : l'admission anonyme (`X-Session-Token`) et le handler tus ne sont pas jugés (les cercles sont réservés aux comptes) ; ouvrir une issue si le plancher doit aussi y courir.
