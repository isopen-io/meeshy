# Réels plein écran (iOS) — long-press feed → pager vertical immersif

**Branche** : `claude/lucid-curie-xxpdut`
**Date** : 2026-06-13

## Demande
- Long-press sur le bouton feed → réels en plein écran avec effet d'agrandissement,
  1ʳᵉ vidéo chargée, description en overlay, vue commentaires, etc.
- Les posts média (audio seul / vidéo seule / images seules / vidéo / multi-images /
  audio + image(s)) deviennent automatiquement des « réels » dès la création.
- Datation des posts : secondes (à l'instant) → minutes → heures → jours → **date**.
- Le feed remonte posts ET réels ; un réel a une forme différente et s'ouvre
  directement en plein écran (pas la page détail), avec gesture vertical haut/bas
  pour passer d'un réel à l'autre.
- Retour : flèche haut-gauche (Liquid Glass via helpers compat) + gesture bord gauche.

## Décision d'architecture structurante
**Pas de type `REEL` en base.** Le schéma reste `POST | STORY | STATUS`. La nature
« réel » est **dérivée** de la composition média (`FeedPost.isReel`), donc :
- contrat serveur / pagination inchangé (conforme à « les clients n'auront pas à
  être mis à jour » — quand le ranking par attention arrivera, seul le tri serveur
  bouge) ;
- « automatique à la création » est gratuit : tout post créé avec média est rendu
  comme un réel, aucune logique composer à modifier.
- Un réel = POST (ou post sans type) **non-repost** portant ≥1 média image/vidéo/audio.
  Stories, statuses, reposts et posts texte ne sont jamais des réels.

## Moteur vidéo
Le pager réutilise **le moteur unique call-safe** `SharedAVPlayerManager.shared` :
une seule vidéo active à la fois. La page active charge l'URL dans le manager
(loop + son), les autres pages affichent un poster (thumbHash → thumbnail). Rendu
via un `AVPlayerViewController` sans chrome (`resizeAspectFill`). Le
téléchargement/cache passe par le `VideoAvailabilityResolver(autoDownload:true)` du
feed.

## Livré

### SDK (auto-inclus SwiftPM — pas d'édition pbxproj)
- `Models/FeedModels.swift` : `FeedPost.isReel`, `primaryReelMedia`,
  `static reels(from:)` (logique pure de classification).
- `Models/RelativeTime.swift` : `RelativeTimeUnit` + `RelativeTime.classify` (ladder
  pur seconde→minute→heure→jour→date, sans string UI).
- `Compatibility/AdaptiveVerticalPager.swift` : pager vertical snap (iOS 17
  ScrollView+paging+scrollPosition ; iOS 16 TabView pivoté 90°).
- Tests : `RelativeTimeTests`, `FeedReelClassificationTests`.

### App (Meeshy.xcodeproj — 2 fichiers enregistrés au pbxproj)
- `ViewModels/ReelsViewModel.swift` : pagination curseur via `/posts/feed` filtrée
  aux réels, seed cache-first depuis le feed, like/bookmark optimistes, share, view.
- `Views/ReelsPlayerView.swift` : `ReelsPresenter` (singleton observable, 2 entrées),
  `RelativeTimeFormat` (rendu localisé du ladder + date absolue), pager plein écran,
  pages vidéo/image(carousel)/audio, rail d'actions (like/commentaire/bookmark/
  partage), back (bouton Liquid Glass `adaptiveGlass` + strip drag bord gauche 18pt),
  feuille commentaires réutilisant `CommentsSheetView`.
- `Views/FeedPostCard.swift` : `timeAgo` délègue à `RelativeTimeFormat` (repli date) ;
  badge « Réel » sur l'aperçu média des posts-réels.
- `Views/FeedView.swift` : tap d'un post réel → `ReelsPresenter.present` (pager),
  sinon page détail.
- `Views/RootView.swift` : long-press bouton feed → `presentFresh()` ; overlay réels
  (transition scale = agrandissement) ; boutons flottants/menu masqués pendant le réel.

## Vérification — LIMITE IMPORTANTE
Conteneur **Linux sans Xcode/Swift** : impossible de compiler ou lancer
`./apps/ios/meeshy.sh build|test` ici. Code écrit par fidélité aux patterns
existants et vérifié par inspection. **À valider sur macOS** :
1. `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package` (tests purs).
2. `./apps/ios/meeshy.sh build` puis smoke device :
   - long-press feed → agrandissement + 1ʳᵉ vidéo + overlay ;
   - swipe haut/bas entre réels (un seul son actif) ;
   - retour bouton + bord gauche ;
   - tap réel dans le feed → plein écran (pas détail) ;
   - datation à l'instant/m/h/j/date.
3. Point d'attention iOS 16 : la trick TabView pivotée d'`AdaptiveVerticalPager` doit
   être validée sur device/simulateur iOS 16 (transform non testable hors run).

## Suites possibles
- Son réel : actuellement piloté via `SharedAVPlayerManager` (son ON). Si on bascule
  un jour sur le style `.flat` (muet), prévoir un paramètre `isMuted` SDK.
- Télémétrie watch-time (durée vue / complétion / re-watch) → préalable au ranking.
- Fonction de score serveur (insertion sponsorisée, boost créateurs, plafonds).
