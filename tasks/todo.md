# Liens YouTube dans posts & messages : cliquables + tracés /l/token + façade player

## Diagnostic (fait, preuves sur simulateur iPhone 16 Pro)
- Player YouTube inline (WKWebView, `YouTubeEmbedPlayerView`) renvoie `onerror:152` pour TOUTES les vidéos
  (vérification d'origine/referrer YouTube). Même Safari-du-simulateur → `153` sur l'embed direct.
  Aucun handler `onError` → boîte noire morte. Séquence prouvée : `apiready → onready → play() → onerror:152`.
- Posts (`FeedPostCard`, `PostDetailView`) : corps en `Text(...)` brut → liens NON cliquables.
- Messages : liens cliquables (`MessageTextRenderer`) mais URL brute → pas de `/l/token`.
- Infra serveur DÉJÀ présente : `POST /tracking-links` (mint, dédup, renvoie `https://meeshy.me/l/<token>`),
  `GET /l/:token` (capture clic IP/UA/device/referrer/user + 302 vers l'URL finale).

## Décisions (user)
1. Player = **façade** → tap ouvre le lien tracké (pas de WKWebView inline).
2. Tracking = **mint à l'envoi côté gateway** → token dans `Message.metadata`/`Post` → clients rendent `/l/<token>`.

## Increment A — iOS façade (FAIT ✅ vérifié simulateur : tap embed = la vidéo s'ouvre/joue)
- [x] Instrumentation diagnostique retirée (fichier player supprimé)
- [x] `VideoEmbedContainer` → façade : aperçu PRÉSERVÉ, tap ouvre la vidéo (openURL)
- [x] Player WKWebView inline supprimé (`YouTubeEmbedPlayerView`/Controller/Model/fullscreen)
- [x] `EmbeddedVideo.watchURL` (SDK atome) + helper pur app `VideoEmbedDestination` (tracké sinon watch)
- [x] Tests : watchURL (SDK) + VideoEmbedDestination (app)
- [x] Build OK + vérif simulateur (aperçu intact, tap = ouvre/joue la vidéo)
- [ ] (déplacé en C) Posts cliquables via `MessageTextRenderer` — fait avec le rendu tracké

## Increment B — Gateway mint à l'envoi (généralisé, réutilise l'existant)
- [x] `TrackingLinkService.processMessageLinks` : option `rewriteToShortLink=false` (mint sans réécrire → aperçu préservé) — PAS de méthode parallèle
- [x] `MessageProcessor.buildRawUrlTrackingLinks` (helper réutilisant la méthode ci-dessus, jamais bloquant)
- [x] Message create : `metadata.trackingLinks = [{url, token}]` (ignoré si chiffré) — compile 0 erreur
- [x] Sérialisation ack (`...message` spread inclut metadata)
- [x] REST list sérialise `metadata.trackingLinks` (messages.ts L931)
- [x] Broadcast socket `message:new` : `trackingLinks` hissé top-level (miroir postReplyTo)
- [ ] Post create (PostService) : même helper généralisé → metadata.trackingLinks
- [ ] Stories / commentaires : même helper (généralisation demandée)
- [ ] Tests gateway (mint mapping-only, dédup, skip m+token/déjà-tracké)

## ⚠️ Contrainte env vérif e2e
Le simulateur est connecté au gateway **PRODUCTION** (gate.meeshy.me). Mes changements gateway sont
locaux → pas live pour le simulateur. Vérif e2e du `/l/token` = soit déployer (staging), soit pointer
l'app sur un gateway local (env Localhost + lancer le gateway). À décider avec le user.

## Increment C — iOS rendu tracé
- [ ] SDK : parse `metadata.trackingLinks` dans les modèles message/post
- [ ] `MessageTextRenderer` : mappe URL détectée → `/l/<token>` comme cible du lien
- [ ] Façade ouvre `/l/<token>` quand dispo
- [ ] Tests + vérif simulateur (clic = passe par /l/token → capture → redirige)

## Notes
- Réutiliser `Message.metadata` (Json) — pas de nouvelle colonne (cf. lessons).
- Façade : `VideoEmbedThumbnail` (SDK atome) prend déjà un `onTap` → l'app passe l'action d'ouverture.
