# iOS — Lecture YouTube intégrée (embeds vidéo côté client)

**Date** : 2026-06-18
**Statut** : Design validé, en attente de plan d'implémentation
**Périmètre v1** : iOS uniquement. Web en phase 2 (abstraction posée mais non implémentée).

## Objectif

Quand un lien YouTube est présent dans un poste (Feed), un détail de poste, ou un
message de conversation, l'utilisateur voit une vignette cliquable et peut lire la
vidéo **directement dans Meeshy**, sans quitter l'app. YouTube est le premier
fournisseur d'un cadre générique d'embeds vidéo côté client.

## Décisions structurantes (validées avec l'utilisateur)

1. **Plateformes** : iOS d'abord, web ensuite (rollout habituel). Le web réutilisera
   l'abstraction provider-agnostique mais n'est pas dans le périmètre v1.
2. **Métadonnées** : hybride. Façade 100 % client-side maintenant (miniature via URL
   prédictible, aucun backend touché), avec un **hook serveur réservé** dans le modèle
   pour brancher plus tard un unfurl oEmbed sans refonte.
3. **Lecture** : inline sur place (le player remplace la vignette) **+ bouton plein
   écran**.

## Contrainte non négociable : pas de réutilisation d'AVPlayer

Les CGU de YouTube imposent l'usage du player officiel (IFrame Player API) et
interdisent l'extraction du flux brut. Conséquence : `MeeshyVideoPlayer` (AVPlayer)
**ne peut pas** lire YouTube. La lecture passe par un `WKWebView` chargeant l'IFrame
Player API. C'est un composant **nouveau**, distinct de l'infra vidéo native existante.

## Approche retenue

**WKWebView + YouTube IFrame Player API, pattern façade.**
- Conforme aux CGU, zéro dépendance externe, contrôle total.
- Façade : en surface scrollable on n'affiche qu'une vignette légère + overlay play ;
  le `WKWebView` lourd ne s'instancie qu'au tap.
- Alternatives écartées : `youtube-ios-player-helper` (wrapper ObjC ancien, peu
  maintenu, moins de contrôle) ; extraction de flux + AVPlayer (viole les CGU, fragile,
  risque de rejet App Store).

## Architecture

### Abstraction générique (cadre vidéo)

Modèle provider-agnostique, YouTube comme première implémentation.

- `enum VideoEmbedProvider { case youtube }` — extensible (vimeo, dailymotion… plus tard).
- `struct EmbeddedVideo: Sendable, Equatable` :
  - `provider: VideoEmbedProvider`
  - `videoId: String`
  - `startSeconds: Int?`
  - calculés : `thumbnailURL(quality:) -> URL`, `embedURL: URL`
- `enum EmbeddableVideoResolver` (pur, stateless) :
  - `static func resolve(url: URL) -> EmbeddedVideo?`
  - `static func resolve(in text: String) -> EmbeddedVideo?` (première URL embeddable)
  - Gère : `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`,
    `youtube.com/embed/`, `m.youtube.com`, paramètres temporels `&t=`/`?t=`/`#t=`
    (formats `90`, `1m30s`). Ignore les paramètres parasites (playlist, `si`, UTM).
  - Retourne `nil` pour toute URL non-embeddable ou malformée.

Ajouter un provider = un `case` + règle d'URL embed + règle de miniature. C'est le
point d'extension du cadre général.

### Placement SDK / MeeshyUI / app (règle de pureté)

| Couche | Composants | Justification |
|--------|-----------|---------------|
| **MeeshySDK (core)** | `EmbeddableVideoResolver`, `EmbeddedVideo`, `VideoEmbedProvider` | Moteur de règles stateless + value types agnostiques. Building blocks. |
| **MeeshyUI** | `YouTubeEmbedPlayerView` (atome `WKWebView` enveloppant l'IFrame API, prend un `videoId` + config + callbacks d'état, opaque) ; `VideoEmbedThumbnail` (atome : miniature + overlay play + badge provider) | Composants paramétrés, agnostiques des singletons Meeshy. Précédent prouvé : `DocumentWebView: UIViewRepresentable` (MeeshyUI/Media/). |
| **app (apps/ios/Meeshy)** | `VideoEmbedContainer` (cascade vignette → player au tap, single-active, call-aware, plein écran) ; câblage des 3 surfaces ; intégration coordinateurs | Orchestration UX produit + dépend des singletons Meeshy (`PlaybackCoordinator`, `MediaSessionCoordinator`). Analogue de `VideoAvailabilityResolver`. |

### YouTubeEmbedPlayerView (MeeshyUI)

- `UIViewRepresentable` autour d'un `WKWebView`.
- Charge un HTML local minimal intégrant l'IFrame Player API (`https://www.youtube.com/iframe_api`)
  paramétré par `videoId` et `startSeconds`.
- Configuration : `allowsInlineMediaPlayback = true`,
  `mediaTypesRequiringUserActionForPlayback = []` (la lecture est déjà déclenchée par
  un tap utilisateur côté façade).
- Bridge JS (`WKScriptMessageHandler`) exposant les transitions d'état
  (`ready`, `playing`, `paused`, `ended`) et permettant `getCurrentTime()` à la demande.
  Sous `defaultIsolation(MainActor)`, le callback `userContentController(_:didReceive:)`
  est implicitement `@MainActor` (pratique pour mettre à jour l'état) — garder la
  surface JS minimale (événements d'état + `getCurrentTime` à la demande, rien en continu).
- Callbacks : `onStateChange`, `onReady`. Pas de flux haute fréquence vers SwiftUI.
- **Contraintes SDK iOS 16** : APIs iOS-16-safe uniquement ; utiliser le wrapper
  `adaptiveOnChange` (pas de `.onChange` brut). Si un template HTML local est bundlé
  dans `MeeshyUI/Resources/` (`.process("Resources")` déjà déclaré), accéder à
  `Bundle.module` **uniquement depuis un contexte `@MainActor`** (gotcha connu).

### VideoEmbedContainer (app)

Machine à états :

```
idle(vignette) ──tap──▶ loading ──ready──▶ playing ──expand──▶ fullscreen
      ▲                                         │
      └───────────── teardown (scroll-off / recyclage / single-active) ──────────┘
```

- État `idle` : `VideoEmbedThumbnail` seul (aucun `WKWebView`).
- Au tap : `PlaybackCoordinator.shared.willStartPlaying(external:)` (stop des autres
  médias) + `MediaSessionCoordinator.shared.activatePlaybackSync(...)` (session audio),
  puis instanciation de `YouTubeEmbedPlayerView`.
- **Single-active via `PlaybackCoordinator` (MeeshyUI), pas via une extension de
  `MediaSessionCoordinator`.** Le player conforme le protocole **existant**
  `StoppablePlayer` (`func stop()`), s'enregistre via `registerExternal(_:)` et réclame
  la session via `willStartPlaying(external:)`. Référence à copier : `StoryMediaCoordinator`.
  Rôles : `PlaybackCoordinator` = mutex single-active hétérogène ; `MediaSessionCoordinator`
  = session `AVAudioSession` refcountée + call-aware. **À vérifier en implémentation** :
  `willStartPlaying(external:)` doit bien stopper aussi la **vidéo native**
  (`SharedAVPlayerManager`) — sémantique à confirmer/ajuster pour qu'ouvrir un embed
  vidéo coupe une vidéo native en cours.
- `stop()` (appelé par le coordinateur quand un autre média démarre) doit : pauser via
  le bridge JS (`pauseVideo()`), nettoyer l'état, et `deactivatePlaybackSync()`.
- Teardown du `WKWebView` :
  - **Messages** (`UICollectionView` à cellules recyclées, `UIHostingConfiguration`) :
    via `onDisappear` de la vue hostée — les hooks de cycle de vie SwiftUI se
    déclenchent correctement dans `UIHostingConfiguration`. Ne PAS se reposer sur le
    seul recyclage de cellule.
  - **Feed / détail** (SwiftUI pur, `LazyVStack` / `ScrollView`) : teardown automatique
    au scroll-off.
- Call-aware : observer `MediaSessionCoordinator` (`isCallActive` synchrone +
  publisher `events` pour `interruptionBegan` / route change) → pause à l'ouverture
  d'un appel ; gate l'entrée `play` si `isCallActive`.

## Flux de données & modèle

### v1 — résolution client-side

Chaque surface résout la première URL via `EmbeddableVideoResolver`. La résolution est
**mémoïsée** par `post.id` / `message.id` (hors du `body`, pour ne pas re-scanner à
chaque render — même discipline que la mémoïsation de layout existante). La vignette
ne déclenche aucun appel réseau métier (URL `img.youtube.com/vi/{id}/hqdefault.jpg`,
chargée via `CachedAsyncImage`).

### Hook serveur réservé (phase ultérieure)

On documente dès maintenant une forme dans `Post.metadata` / `Message.metadata` :

```json
"embed": {
  "provider": "youtube",
  "id": "<videoId>",
  "title": "<optional>",
  "channelTitle": "<optional>",
  "durationSeconds": 0,
  "thumbnailUrl": "<optional>"
}
```

Plus tard, le gateway pourra unfurler via oEmbed YouTube et remplir ce champ. Le
`VideoEmbedContainer` prendra alors un `EmbeddedVideo` **fourni** (mappé depuis
`metadata.embed`) au lieu de **détecté**, sans changer le contrat de vue. Aucun travail
backend en v1.

## Câblage des 3 surfaces (app-side)

### Messages — `BubbleStandardLayout`

Aujourd'hui : la première URL du corps → `LinkPreviewCard` (aperçu OG), point
d'insertion confirmé (`content.text?.firstLinkURL`, `String?`, **déjà précalculé** par
`BubbleContentBuilder` via `LinkPreviewFetcher.firstURL` au build du `BubbleContent` —
détection gratuite, pas de scan par render). Nouvelle précédence à ce point :

1. Résoudre `firstLinkURL` via `EmbeddableVideoResolver`.
2. Si `EmbeddedVideo` non nil → `VideoEmbedContainer`.
3. Sinon → `LinkPreviewCard` (comportement OG **inchangé**).

Comme `firstLinkURL` fait déjà partie de l'égalité de `BubbleContent`, aucun champ
supplémentaire dans l'`Equatable` de la bulle n'est requis.

### Feed — `FeedPostCard`

Aujourd'hui : `post.content` en texte brut, aucune détection de lien. `FeedPostCard` est
un **struct stateless `Equatable`** (pas de ViewModel ni `@State`), hosté dans un
`LazyVStack` SwiftUI pur.
Ajout : détecter la première URL du `post.content` ; si `EmbeddedVideo` → afficher
l'embed (façade) sous le texte (entre le panneau de traduction secondaire et le bloc
repost). **On n'ajoute pas l'aperçu OG générique aux postes** (voir Hors scope).

**Mémoïsation + footgun `Equatable`** : résoudre l'`EmbeddedVideo` côté parent
(`FeedView`, où vit `viewModel.posts`) et le passer en paramètre (`embeddedVideo:
EmbeddedVideo?`) plutôt que de re-scanner dans le `body`. Si on ajoute ce paramètre, il
**doit** être inclus dans le `static func ==` de `FeedPostCard`, sinon le gate
`.equatable()` court-circuite des re-renders nécessaires
(cf. footgun Equatable + état).

### Détail — `PostDetailView`

Même logique que le Feed (`ScrollView` + `LazyVStack` SwiftUI pur, teardown auto).
Inline par défaut, bouton plein écran disponible. Pas de gate `Equatable` ici.

## Plein écran

Inline par défaut ; bouton expand → `fullScreenCover` hébergeant le même
`YouTubeEmbedPlayerView` en grand. Continuité de lecture : au tap expand, lecture de
`getCurrentTime()` via le bridge JS, relance du player plein écran avec `startSeconds`.

*Évolution possible (hors v1)* : instance `WKWebView` partagée déplacée entre inline et
plein écran pour une transition sans rechargement.

## Performance / thermique / audio

Contraintes issues de l'historique reels (re-render 10 Hz, pool de lecteurs, call-aware) :

- **Façade stricte** : en surface scrollable, seulement la vignette. `WKWebView`
  instancié uniquement au tap.
- **Single-active** : un seul embed lecteur vivant à la fois, via `PlaybackCoordinator`
  (protocole `StoppablePlayer`) — coexistence déjà gérée pour audio/vidéo native/story.
- **Teardown** : messages = `onDisappear` (cellules `UICollectionView` recyclées) ;
  feed/détail = automatique (SwiftUI pur). Destruction du `WKWebView`, arrêt des timers JS.
- **Pas de `@Published` haute fréquence** vers le `body` : `getCurrentTime()` interrogé
  seulement à l'expand, jamais en continu (on n'ouvre pas la porte au bug « blur 10 Hz »).
- **Call-aware** : enregistrement auprès de `MediaSessionCoordinator` → pause sur appel,
  stop des autres médias (audio, vidéo native, stories) à l'ouverture.
- **Pas d'autoplay** : tap-to-play uniquement.

## Tests (TDD)

- `EmbeddableVideoResolver` (SDK, Swift Testing) :
  - Formes valides : `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `m.youtube.com`,
    avec/ sans timestamp (`t=90`, `t=1m30s`, `#t=`), avec params parasites.
  - Non-YouTube (vimeo, site quelconque) → `nil`.
  - Malformées / schémas non-http → `nil`.
  - Construction `thumbnailURL` / `embedURL`.
- Coordinateur single-active : ouvrir B pause/détruit A.
- `VideoEmbedContainer` (XCTest) : transitions d'état, teardown au recyclage.
- Intégration :
  - Message avec lien YouTube → `VideoEmbedContainer` rendu ; lien non-vidéo →
    `LinkPreviewCard` (OG) conservé.
  - Post Feed / détail avec lien YouTube → embed rendu.

## Hors scope (YAGNI)

- **Web** (phase 2 ; l'abstraction provider-agnostique est posée pour le réutiliser).
- **Aperçu OG générique dans les postes** : les postes ne reçoivent que l'embed vidéo
  en v1. L'OG générique reste limité aux messages (existant).
- **Autres providers** (Vimeo, etc.) : le cadre est extensible mais seul YouTube est
  implémenté.
- **Unfurl serveur oEmbed** : hook de modèle réservé seulement, aucun code gateway.

## Fichiers concernés (indicatif)

- Nouveau — `packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift`
  (+ `EmbeddedVideo`, `VideoEmbedProvider`).
- Nouveau — `packages/MeeshySDK/Sources/MeeshyUI/Media/YouTubeEmbedPlayerView.swift`.
- Nouveau — `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift`.
- Nouveau — `apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift`
  (conforme `StoppablePlayer`).
- Modifié — `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
  (précédence embed/OG, point d'insertion `content.text?.firstLinkURL`).
- Modifié — `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (param `embeddedVideo`
  + mise à jour du `==`) et `FeedView.swift` (résolution parent + passage en param).
- Modifié — `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (détection + embed).
- Vérif/ajust éventuel — `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
  (sémantique `willStartPlaying(external:)` vs vidéo native). Pas de nouveau coordinateur :
  on conforme `StoppablePlayer` (existant) et on observe `MediaSessionCoordinator` (existant).
- pbxproj : **seul** `VideoEmbedContainer.swift` (app-side) demande la chirurgie manuelle
  (4 entrées + 2 UUIDs, xcodeproj objectVersion 63). Les fichiers SDK/MeeshyUI sont
  auto-découverts (SPM) → aucune entrée pbxproj.
- Info.plist : **aucune modif** (ATS HTTPS déjà OK pour YouTube).
- Tests SDK + app correspondants.

## Revue d'implémentabilité (2026-06-18)

Vérifié contre le code réel (4 sondages read-only). **Verdict : implémentable, aucun
blocker.** Synthèse :

| Point | Verdict | Ancrage réel |
|-------|---------|--------------|
| WKWebView dans MeeshyUI | ✅ | `DocumentWebView: UIViewRepresentable` (MeeshyUI/Media/) importe déjà WebKit |
| Resolver pur en core | ✅ | Pattern `LinkPreviewFetcher` (MeeshySDK/Services/), core = nonisolated |
| Miniature | ✅ | `CachedAsyncImage(url:targetSize:)` (MeeshyUI/Primitives/) |
| Single-active hétérogène | ✅ (dé-risqué) | Protocole `StoppablePlayer` + `PlaybackCoordinator` existants ; réf. `StoryMediaCoordinator` |
| Call-aware | ✅ | `MediaSessionCoordinator.isCallActive` (sync) + publisher `events` ; `CallManager` propage déjà |
| Insertion messages | ✅ | `firstLinkURL` précalculé dans `BubbleContent`, point clair |
| Teardown messages | ⚠️ gérable | Liste = `UICollectionView` recyclé + `UIHostingConfiguration` → teardown via `onDisappear` |
| Insertion feed/détail | ✅ | SwiftUI pur (`LazyVStack`/`ScrollView`), teardown auto |
| ATS / Info.plist | ✅ | HTTPS imposé, YouTube HTTPS, zéro exception |
| Cibles iOS | ✅ | App iOS 17, SDK iOS 16 ; WKWebView dispo |
| pbxproj | ✅ (1 fichier) | Seul le fichier app-side ; SDK auto-découvert |

**À confirmer pendant l'implémentation (non bloquant) :**
1. Sémantique exacte de `PlaybackCoordinator.willStartPlaying(external:)` vis-à-vis de
   l'arrêt de la **vidéo native** (`SharedAVPlayerManager`) — ajuster pour qu'ouvrir un
   embed coupe une vidéo native.
2. `WKScriptMessageHandler` implicitement `@MainActor` sous MeeshyUI → surface JS minimale.
3. `Bundle.module` (si template HTML bundlé) accédé seulement en `@MainActor`.
4. APIs iOS-16-safe côté SDK + `adaptiveOnChange` (pas de `.onChange` brut).
5. Fiabilité du bridge JS WKWebView (risque moyen) → garder le contrat d'état simple.
