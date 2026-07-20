# PostDetailView — Rendu inline des stories + remontée auteur (pseudo + stats) dans le header

- **Date** : 2026-06-20
- **Plateforme** : iOS (SwiftUI) + MeeshySDK / MeeshyUI
- **Statut** : design validé en brainstorming, en attente de revue utilisateur
- **Écran cible** : `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- **Spec antérieur** : `docs/superpowers/specs/2026-06-14-ios-postdetail-collapsible-author-header-design.md` (pose le `CollapsibleHeader` + slot `centerReveal`). Ce spec **étend** ce socle.

> Note de périmètre : ce design ne concerne que `PostDetailView` (page de détail
> classique, layout vertical scrollable). Il ne touche **pas** `ReelsPlayerView` / le viewer
> story plein écran (`StoryViewerView`), qui restent les chemins de lecture immersive.

## Objectif

Deux demandes utilisateur, traitées ensemble car elles touchent la même page :

1. **Rendu des stories en page Détail.** Quand le post ouvert en Détail est lui-même une
   **story**, restituer son **canvas** (médias + texte/overlays + audio) en **réutilisant le
   reader inline** `StoryReaderRepresentable` — aujourd'hui le reader n'est utilisé que pour
   les **reposts** de type STORY (`repostEmbed`), jamais pour une story ouverte directement.
2. **(« ET SURTOUT ») Remontée auteur enrichie dans le header.** Faire **remonter dans le
   header collapsible**, quand la zone auteur quitte l'écran au scroll : **avatar + nom
   d'affichage + pseudo (`@username`) + statistiques** (vues · impressions). Le reveal existe
   déjà (avatar + nom + date + drapeaux) mais **n'inclut ni le pseudo ni les stats**.

## État actuel (établi par lecture du code)

| Élément | État | Référence |
|---|---|---|
| `CollapsibleHeader` + `centerReveal: { authorRevealView(post) }` | **Déjà câblé** | `PostDetailView.swift:776-787` |
| Tracking scroll (`GeometryReader` → `ScrollOffsetPreferenceKey` → `headerScrollOffset`) | **Déjà câblé** | `PostDetailView.swift:423-438` |
| `authorRevealView` montre avatar + nom + **date relative** + drapeaux | **Existant** — manque pseudo + stats | `PostDetailView.swift:662-735` |
| `authorReachLine` (inline) : `@pseudo · 👁 vues · 📊 impressions`, **stats réservées auteur** | **Existant** (à réutiliser) | `PostDetailView.swift:796-824` |
| `StoryReaderRepresentable` (reader inline, 9:16) avec inits `story:`/`repost:`/`post:` | **Existant, réutilisable** | `MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` |
| Reader utilisé pour les **reposts** STORY (`mute: true`) | **Existant** | `PostDetailView.swift:1097-1108` |
| `FeedPost` (domain) porte `type`, `media`, mais **PAS** `storyEffects`/`audioUrl` | **Obstacle Req 1** | `FeedModels.swift:401-464` |
| `FeedPost` a un `Codable` **explicite** (CodingKeys manuels) | À étendre pour round-trip cache | `FeedModels.swift:525-578` |
| `PostDetailViewModel` ne conserve que le `FeedPost` converti ; cache = `FeedPost` | **Obstacle Req 1** | `PostDetailViewModel.swift:128-134` ; `loadPost` cache-fresh `:100-102` |
| `RepostContent` porte déjà `storyEffects` + `audioUrl` | Précédent à imiter | `FeedModels.swift:180-231` |

## Décisions issues du brainstorming

| Décision | Choix retenu |
|---|---|
| Layout du reveal auteur | **2 lignes** : ligne 1 = nom (gras) ; ligne 2 = `@pseudo · 👁 vues · 📊 impressions`. Drapeaux + `translate` conservés en trailing. La ligne 2 **remplace la date relative**. |
| Audience des stats dans le reveal | **Auteur uniquement** (miroir exact de `authorReachLine`). Non-auteur → ligne 2 = juste `@pseudo` (ou rien si pas de pseudo). |
| Lecture story en Détail | **Inline avec audio actif** (`mute: false`). Le canvas joue en place. |
| Tap sur le canvas | **Aucun** (supprimé suite à la revue — voir « Revue challengeante »). La lecture inline avec audio suffit ; le tap→plein écran nécessiterait de synthétiser un `StoryGroup` + scoper un `StoryViewModel`, hors périmètre. |
| Légende texte au-dessus du canvas | **Conservée** (`textZone` : header auteur + légende), comme le fait `repostEmbed`. |
| Où vivent les nouveaux champs story | **`FeedPost`** (SDK), champs **optionnels** → rollout-safe + round-trip cache. |
| Correctif gateway | **Aucun** — `GET /posts/:id` renvoie déjà `storyEffects`/`audioUrl` (vérifié — voir « Revue challengeante »). |

## Architecture

### Partie A — Remontée auteur enrichie (Req 2, « ET SURTOUT »)

Changement **localisé à `authorRevealView(_:)`** (`PostDetailView.swift:662`). Aucune
modification de la mécanique de scroll, du `CollapsibleHeader`, ni du SDK.

- **Ligne 1** : `MeeshyAvatar` (26pt, inchangé) + nom en gras (inchangé). Bloc drapeaux de
  langue + icône `translate` conservés en trailing (inchangés, hors du `Button` profil).
- **Ligne 2** (remplace `RelativeTimeFormatter.shortString` actuelle) : réutilise la **même
  logique que `authorReachLine(_:)`** :
  - `@username` si `post.authorUsername` non vide ;
  - si `isPostAuthor` : ` · 👁 <postOpenCount> · 📊 <impressionCount>` via `Self.compactCount`,
    icônes `eye.fill` / `chart.bar.fill` (mêmes SF Symbols qu'inline) ;
  - non-auteur sans pseudo → ligne 2 absente (le reveal se réduit gracieusement à la ligne 1).
- **Refactor anti-duplication** : extraire le contenu de `authorReachLine` en un helper
  partagé paramétré par la taille de police (la zone inline utilise `.caption`/`.caption2`,
  le header un cran plus petit) afin que **inline et header dérivent de la même source** —
  conforme à « Single Source of Truth ». Le helper reste un `@ViewBuilder` privé de la vue
  (il lit `post`, `isPostAuthor`, `theme`).
- A11y : `accessibilityElement(children: .ignore)` + label « Vues et impressions » + value
  `"<postOpenCount> · <impressionCount>"`, identique à l'inline.

**Évolution assumée du spec 2026-06-14** : celui-ci définissait le reveal comme « avatar +
nom + date relative ». La date relative reste disponible dans la zone auteur inline ; sa
disparition du header au profit de `@pseudo · stats` est la demande explicite de
l'utilisateur (densité d'information plus utile une fois replié).

### Partie B — Rendu inline des stories (Req 1)

#### B.1 — SDK : faire transiter le canvas jusqu'au `FeedPost`

Fichier `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift` :

- Ajouter à `FeedPost` deux **stored properties optionnelles** :
  - `public var storyEffects: StoryEffects? = nil`
  - `public var audioUrl: String? = nil`
- Les ajouter à l'init désigné (params avec **défaut `nil`** → tous les call sites existants
  restent valides, rétro-compatible).
- Les ajouter au **`Codable` explicite** (`CodingKeys` + `decodeIfPresent`/`encodeIfPresent`)
  pour qu'ils **survivent au round-trip cache** (`CacheCoordinator.shared.feed` sérialise le
  `FeedPost`). **Point critique** : sans cette étape, le chemin cache-fresh de `loadPost`
  (`PostDetailViewModel.swift:100-102`) restituerait un `FeedPost` sans `storyEffects` → canvas
  vide sur cache hit.
- Ajouter une computed `public var isStory: Bool { (type ?? "").uppercased() == "STORY" }`
  (miroir de `isReel`, `FeedModels.swift:598`).

Fichier `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`, dans
`APIPost.toFeedPost()` : mapper `storyEffects: self.storyEffects` et `audioUrl: self.audioUrl`
(l'`APIPost` les décode déjà, `PostModels.swift:133-135`).

#### B.2 — SDK : init de convenance du reader

Fichier `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` :
ajouter `public init(feedPost: FeedPost, …)` qui synthétise un `StoryItem` **exactement comme
`init(repost:)`** :

```swift
let synthetic = StoryItem(
    id: feedPost.id,
    content: feedPost.content,
    media: feedPost.media,
    storyEffects: feedPost.storyEffects,
    createdAt: feedPost.timestamp,
    expiresAt: nil,          // FeedPost ne porte pas expiresAt — non bloquant pour la lecture
    isViewed: false
)
self.init(story: synthetic, preferredLanguages: …, mute: mute, …)
```

#### B.3 — App : branchement dans `PostDetailView`

Fichier `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`,
dans `postDetailContent(_:)` (`:332`) — ZONE 2 (« Media ») :

- **Gate** : `if post.isStory || post.storyEffects != nil` → rendre le canvas inline **à la
  place de** `detailMediaSection` :
  ```swift
  StoryReaderRepresentable(feedPost: post,
      preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
      mute: false,                      // audio ACTIF (décision brainstorming)
      isPaused: !storyCanvasVisible || isCallActive)   // voir B.4
      .aspectRatio(9.0/16.0, contentMode: .fit)
      .frame(maxWidth: 460)
      .frame(maxWidth: .infinity, alignment: .center)
      .clipShape(RoundedRectangle(cornerRadius: 12))
  ```
- **Sinon** (post normal) : `detailMediaSection(post.media)` (inchangé).
- Le `textZone` (header auteur + légende) reste rendu **au-dessus** (inchangé), comme
  `repostEmbed` rend `repost.content` puis le canvas.
- **Pas de `.onTapGesture`** : décision révisée (voir « Revue challengeante » §2). Le canvas en
  `.play` ignore déjà ses propres taps (gate `mode == .edit`), donc un tap externe *pourrait*
  passer ; mais ouvrir le plein écran imposerait de fabriquer un `StoryGroup` + `StoryViewModel`
  que `PostDetailView` n'a pas. Hors périmètre.

#### B.4 — App : cycle de vie de la lecture (audio actif) — point le plus risqué

Avec `mute: false`, un canvas qui sort du viewport (scroll vers les commentaires) **continuerait
à jouer/sonner** car un `LazyVStack` ne détruit pas systématiquement les vues hors-écran. Donc :

- **Sonde de visibilité dédiée** : le sentinel de scroll existant (`headerScrollOffset`) est en
  **tête** du `ScrollView` et ne renseigne PAS sur la visibilité du **canvas** spécifiquement.
  Ajouter un `GeometryReader` **local autour du canvas** qui calcule si son cadre intersecte le
  viewport visible (frame dans l'espace nommé vs hauteur d'écran) → `@State storyCanvasVisible`.
  Quand invisible → `isPaused = true` (coupe lecture **et** son). Helper de calcul pur testable.
- **Call-aware** : `isPaused` inclut `isCallActive` (pause forcée pendant un appel, cohérent
  avec le comportement story audio call-aware des lots Story fluidity). Source : l'état d'appel
  global déjà observé ailleurs dans l'app.
- **Session audio** : la lecture inline active une `AVAudioSession` de playback. Réutiliser la
  **même politique de session que le `StoryViewer`** (ne pas interrompre inutilement l'audio
  tiers / respecter le contexte) plutôt que d'imposer une catégorie agressive. À vérifier au run :
  ouvrir un Détail story ne doit pas couper la musique de l'utilisateur de façon surprenante.
- **Pas de re-render à fréquence de lecture** : ne PAS câbler `onPlaybackTime`/`onContentProgress`
  sur un `@State`/`@Published` de la vue (cf. leçon Reels thermiques : re-render 10 Hz). Le canvas
  Metal est autonome ; seul `isPaused` (binding discret, change rarement) le pilote.
- **Disparition de la vue** : à la navigation hors Détail, SwiftUI retire le representable →
  canvas démantelé → audio arrêté (garanti par le cycle de vie UIViewRepresentable).

## Réutilisation (anti-duplication)

- **Reader** : aucun nouveau composant de rendu — réutilisation de `StoryReaderRepresentable`
  via un init de convenance aligné sur `init(repost:)`/`init(post:)` existants.
- **Stats reveal** : helper partagé entre la zone inline (`authorReachLine`) et le header
  (`authorRevealView`) — une seule source de la grammaire `@pseudo · 👁 · 📊`.
- **Modèle** : `storyEffects`/`audioUrl` portés par `FeedPost` (comme `RepostContent` les
  porte déjà) — pas de canal parallèle, pas de rétention d'`APIPost` brut.

## Tests

### SDK (`MeeshySDKTests`, XCTest/Swift Testing)
- **Round-trip Codable** : `FeedPost` avec `storyEffects` non nil → `encode` puis `decode`
  préserve `storyEffects`/`audioUrl` (garantit la survie au cache). Test de non-régression :
  un `FeedPost` sans story encode/décode toujours (champs absents → `nil`).
- **`toFeedPost`** : un `APIPost` avec `storyEffects`/`audioUrl` produit un `FeedPost` qui les
  porte ; un `APIPost` sans → `nil`.
- **`isStory`** : `"STORY"`/`"story"` → true ; `"POST"`/`nil` → false.
- **`StoryReaderRepresentable(feedPost:)`** : synthétise un `StoryItem` aux champs attendus
  (id/content/media/storyEffects) — test de la fonction de synthèse (extraire la construction
  du `StoryItem` en helper pur testable si nécessaire).

### App (`MeeshyTests`)
- **Gating pur** : helper « doit-on rendre le canvas ? » = `post.isStory || post.storyEffects
  != nil`, testé sur story / post normal / post média / repost-story.
- **Reveal** : si la construction de la ligne 2 devient non triviale, l'extraire en logique
  pure (ex. `authorRevealSecondaryLine(post:isAuthor:) -> (pseudo:String?, stats:String?)`) et
  tester auteur vs non-auteur vs sans-pseudo.

### Visuel (build + run simulateur)
- Repos : header minimal ; scroll : **avatar + nom + @pseudo + stats** centrés révélés.
- Story en Détail : canvas 9:16 inline, **audio actif**, légende au-dessus, tap → plein écran.
- Pause : scroller vers les commentaires **coupe l'audio** ; remonter le **reprend**.
- Non-régression : post normal rend `detailMediaSection` à l'identique ; repost-story embed
  inchangé (`mute: true`).

## Risques & points d'attention

1. ~~**Le gateway renvoie-t-il `storyEffects` sur `GET /posts/:id` ?**~~ **RÉSOLU (vérifié).**
   `PostService.getPostById` (`PostService.ts:436-438`) fait `findFirst({ include: postInclude })`
   et renvoie `{ ...post }` brut, **sans schéma de réponse** sur la route (`core.ts:167`). Un
   `include` Prisma retourne **tous les scalaires** du modèle ; `storyEffects`/`audioUrl`/
   `audioDuration` (scalaires de `Post`) sont donc déjà dans la réponse. **Aucun fix gateway.**
2. **Round-trip cache obligatoire** : oublier d'ajouter `storyEffects` au `Codable` de
   `FeedPost` → canvas vide sur cache-hit (chemin le plus fréquent). C'est le piège n°1.
3. **Pause off-screen avec audio** : sans gestion fine de visibilité, audio fantôme pendant la
   lecture des commentaires. Vérifier au run.
4. **Re-render / thermique** : ne PAS câbler `onPlaybackTime`/`onContentProgress` du reader sur
   un `@State`/`@Published` de la vue Détail (re-render à fréquence de lecture). Le canvas est un
   `UIViewRepresentable` Metal autonome ; le laisser se rendre seul (cf. leçons Reels thermiques).
5. **Swift 6 isolation** : les callbacks `@Sendable` du reader (onCompletion) et toute closure
   call-aware doivent respecter l'isolation `@MainActor` (cf. pièges connus permission/Combine).
6. **STATUS éphémère** : un `STATUS` (mood) n'est pas couvert par `isStory`. Le gate
   `storyEffects != nil` le couvre **si** il porte des effets ; sinon il tombe sur
   `detailMediaSection`/légende — comportement acceptable, hors périmètre.
7. **Build gate** : tests SDK verts + `./apps/ios/meeshy.sh build` OK. Gateway **non touché**
   → pas de `tsc` gateway requis.

## Revue challengeante (2026-06-20)

Trois passes adversariales (vérification factuelle gateway + iOS, sémantique Prisma). Résultats :

1. **Gateway `storyEffects` — fausse alerte, périmètre RÉDUIT.** Une première passe concluait
   « `storyEffects` non renvoyé, fix gateway requis » en se basant sur le fait que `postInclude`
   ne liste pas `storyEffects`. **Réfuté** : `postInclude` est un `include` (pas un `select`),
   donc Prisma renvoie tous les scalaires de `Post`. `repostOfInclude` doit lister `storyEffects`
   uniquement parce qu'il utilise un `select`. Vérifié dans `PostService.getPostById` :
   `findFirst({ include: postInclude })` + retour `{ ...post }` brut, route sans schéma. → **Aucun
   correctif gateway.** (Leçon : ne pas confondre `include` ⟶ scalaires conservés vs `select`
   ⟶ scalaires restreints.)

2. **Tap → plein écran — SUPPRIMÉ (sur-périmètre).** `StoryViewerView` exige `[StoryGroup]` +
   `StoryViewModel` + binding `isPresented` ; `PostDetailView` n'a aucun des trois. Ouvrir le
   plein écran imposerait de synthétiser un `StoryGroup` mono-story et de scoper un ViewModel —
   non justifié puisque la lecture inline avec audio satisfait déjà la demande. Retiré du design.
   (Bonus confirmé : en `.play` le canvas n'absorbe pas les taps — `mode == .edit` requis — donc
   réintroduire un tap plus tard reste possible sans conflit de gestes.)

3. **Prémisse `FeedPost`/cache — CONFIRMÉE nécessaire.** `CacheCoordinator.feed` stocke bien des
   `FeedPost` ; `FeedPost` n'a aujourd'hui ni `storyEffects` ni `audioUrl`, et `toFeedPost` ne les
   mappe pas. Le plan B.1/B.2 (ajout champs + Codable + mapping) est donc **indispensable**, pas
   optionnel — sinon canvas vide sur cache-hit (chemin dominant).

4. **`StoryItem`/helpers — TOUT confirmé.** Forme de l'init `StoryItem` (labels exacts),
   `Self.compactCount`, `isPostAuthor`, `post.authorUsername/postOpenCount/impressionCount`
   existent et sont réutilisables tels quels. `init(repost:)` est le bon patron pour `init(feedPost:)`.

5. **Audio inline — risque principal confirmé, mitigations renforcées** (cf. B.4) : sonde de
   visibilité **dédiée au canvas** (le sentinel top ne suffit pas), pause call-aware, politique
   `AVAudioSession` alignée sur le viewer, interdiction de câbler `onPlaybackTime` sur l'état SwiftUI.

## Hors périmètre

- Viewer story plein écran (`StoryViewerView`) et Reels (`ReelsPlayerView`).
- Commentaires vocaux, threading replies (sujets séparés du spec 2026-06-14).
- Comptage de vue spécifique « story ouverte en Détail » (le `postOpenCount`/`impressionCount`
  via `registerDetailOpen` s'applique déjà génériquement à tout Post).
