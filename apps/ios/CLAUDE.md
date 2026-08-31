# apps/ios - SwiftUI iOS App

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

## Tech Stack
- SwiftUI (NOT UIKit), iOS 16.0+ (extension MeeshyWidgets : iOS 17.0+), Swift 6 (swift-tools-version 6.2)
- MVVM architecture
- Swift Package Manager (SPM)
- Firebase 12.12 (Analytics, Crashlytics, Messaging, Performance)
- Socket.IO Client 16.1
- WebRTC 146.0.0 (calls)
- Image caching: AsyncImage (SwiftUI native iOS 15+) + CachedAsyncImage + CacheCoordinator 3-tier (no Kingfisher — removed 2026-05)
- Apple Speech framework (`SFSpeechRecognizer`) for on-device speech recognition, via `MeeshySDK.EdgeTranscriptionService` (WhisperKit removed 2026-07-10 — it was declared but never imported)

## Project Structure
```
Meeshy/
├── MeeshyApp.swift              → Entry point, auth flow, splash
├── DesignSystem/
│   ├── DesignSystem.swift       → View modifiers, effects, haptics
│   └── Theme.swift              → ThemeManager, colors, gradients
├── Features/Main/
│   ├── Views/                   → Full-screen views
│   ├── ViewModels/              → State management (MVVM)
│   ├── Models/                  → Data models (API + local)
│   ├── Navigation/              → Router, Route enum (NavigationStack)
│   ├── Services/                → Networking & business logic
│   └── Components/              → Reusable UI components
└── Assets.xcassets
```

## Build Commands
**TOUJOURS utiliser `./apps/ios/meeshy.sh`** pour builder et lancer l'app. Ne jamais utiliser `xcodebuild` directement.
Le build utilise le dossier `Build/` relatif au workspace (`apps/ios/Build/`). Xcode et meeshy.sh partagent ce meme dossier via `WorkspaceSettings.xcsettings` (DerivedData workspace-relative).
```bash
./meeshy.sh build              # Build only (non-blocking)
./meeshy.sh run                # Build+install+launch (preferred for dev)
./meeshy.sh stop               # Stop running app
./meeshy.sh restart            # Stop+build+install+launch
./meeshy.sh logs               # Stream simulator logs
./meeshy.sh status             # Show simulator/app/build status
./meeshy.sh clean              # Clean artifacts (--deep for global)
./meeshy.sh test               # Unit tests (--ui for UI tests)
```

### `meeshy.sh test` — exécution phasée (2026-07-04)
Le run commence par la **phase 0** (suite du package MeeshySDK, cf. plus bas), puis se déroule en 3 phases côté app (`build-for-testing` une fois, puis 3 × `test-without-building`) et **se termine toujours avec l'app connectée au compte de test** :
1. **Phase 1 — suites isolées** : infra, appels/WebRTC, média, value-logic (~190 classes).
2. **Phase 2 — connexion & manipulation de contenu** : auth/session, stories, posts/feed/reels, traduction, brouillons locaux, UI/UX produit (~175 classes). Contient les 13 suites qui mutent l'état persistant réel (dont `AuthServiceTests` et ses vrais `AuthManager.shared.logout()`) — d'où leur passage AVANT la phase 3.
3. **Phase 3 — `ZZEndStateConnectedSessionTests`** : login réel avec `DEMO_USER`/`DEMO_PASSWORD` (sourcés de `fastlane/.env`, injectés via `TEST_RUNNER_*`). `MeeshyTests` étant hébergé dans Meeshy.app, la session Keychain écrite par ce test survit au run : l'app relancée démarre connectée. Ne JAMAIS ajouter de logout/tearDown à cette suite, ni de suite qui s'exécuterait après elle.

La répartition 1/2 est dérivée dynamiquement des noms de classes (`FINAL_PHASE_CLASS_PATTERN` dans `meeshy.sh`) : toute nouvelle suite dont le nom matche un token produit (Story, Post, Feed, Draft, Language, Auth, Session, Bubble, Conversation, Message…) rejoint automatiquement la phase 2. Un échec de phase n'empêche pas les phases suivantes de tourner (la phase 3 s'exécute toujours) ; le script sort non-zéro si une phase est rouge. Résultats : `test-results/phase{1-isolated,2-content,3-connected}.xcresult`.

**Phase 0 — tests SPM du SDK** (`MeeshySDKTests`, `MeeshyUITests` via le scheme `MeeshySDK-Package`) : ils tournent dans leur propre hôte xctest, hors du conteneur de Meeshy.app — ils ne peuvent donc pas affecter l'état de session de l'app, et ne participent pas à la répartition 1/2. Ils font en revanche partie du **verdict** du gate depuis 2026-07-30 : sans eux, un test rouge sous `packages/MeeshySDK/Tests/**` restait invisible en local et n'apparaissait qu'au push (`sdk-tests.yml`). Résultat : `test-results/phase0-sdk.xcresult`. `--skip-sdk` la saute pour une itération rapide sur du code purement app — jamais avant un commit.
- Simulator: iPhone 16 Pro (UDID: 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5)
- Bundle ID: `me.meeshy.app`

## Gestion de projet Xcode — XcodeGen (source de vérité)
**`apps/ios/project.yml` est la source de vérité du projet** (XcodeGen). Le `Meeshy.xcodeproj/project.pbxproj` et les `xcshareddata/xcschemes/*.xcscheme` committés sont des **artefacts générés**, potentiellement périmés par rapport à `project.yml` et aux fichiers sur disque.

- **Sources en globbing récursif** : `sources: - path: Meeshy` avec `excludes: "**/*.md"`. Tout nouveau `.swift` sous `Meeshy/` est **auto-inclus** par `xcodegen generate` — **jamais d'édition manuelle du pbxproj** (le projet a migré du pbxproj hand-edité vers XcodeGen). Les `.md` sont exclus du build (mais matchent quand même le filtre de chemins CI `apps/ios/**` → un edit de ce CLAUDE.md retrigge « iOS Tests »).
- **Le scheme partagé `Meeshy` est déclaré dans la section `schemes:` de `project.yml`**, pas via la clé `scheme:` du target. Raison : `TargetScheme` n'a pas de sous-clé `archive`, et une `archive.postActions` posée dessous est **silencieusement ignorée** (vérifié XcodeGen 2.44.1). Or l'ArchiveAction porte la **post-action de strip des signatures de frameworks embarqués**, seul garde-fou contre le rejet ITMS-90035 (« Invalid Signature » sur FirebaseAnalytics / GoogleAppMeasurement / GoogleAppMeasurementIdentitySupport / GoogleAdsOnDeviceConversion). Cette post-action a existé dans le `.xcscheme` committé du 2026-05-18 au 2026-08-04, puis a disparu à la migration XcodeGen : **tout archivage Xcode GUI a livré des binaires rejetés pendant ce temps, sans qu'aucun build ne devienne rouge**. Ne jamais la déplacer sous `scheme:` — garde : `ArchiveSignatureStripGuardTests`.
- **Signature des frameworks embarqués (ITMS-90035)** — deux causes distinctes, ne pas les confondre :
  1. *Signature de développement résiduelle.* À l'`archive`, la signature automatique signe les XCFrameworks binaires SPM avec **Apple Development** ; `-exportArchive` les re-signe, et le « replacing existing signature » laisse des métadonnées rejetées. `ci_scripts/ci_post_xcodebuild.sh` les strippe ENTRE archive et export — câblé sur la lane fastlane `build_production`, `ios-release.yml`, la post-action du scheme (Xcode GUI), `meeshy.sh archive` et `meeshy.sh distribute`.
  2. *Stub des frameworks sans code — la cause du rejet Xcode Cloud 1742.* FirebaseAnalytics, GoogleAdsOnDeviceConversion, GoogleAppMeasurement et GoogleAppMeasurementIdentitySupport sont des **codeless frameworks** (leur code est dans des libs statiques). Xcode leur injecte un binaire stub — `note: Injecting stub binary into codeless framework` — compilé depuis `/dev/null` et linké avec `-Xlinker -adhoc_codesign` vers un fichier temporaire nommé d'après le triplet : **`arm64-apple`**. codesign en dérive l'identifier. Xcode Distribution lit ensuite cet identifier pour bâtir le `--requirements` de l'export, pendant que le bundle est signé sous son vrai identifier → le code ne satisfait pas son propre requirement → ITMS-90035. WebRTC contient du vrai code, ne reçoit pas de stub, et n'est jamais listé par Apple : c'est le discriminant qui identifie ce défaut au premier coup d'œil.
     **Correctif : `ci_scripts/fix_codeless_framework_identifiers.sh`, branché en `postBuildScripts` du target Meeshy** (`project.yml`). Il ré-identifie les stubs pendant le BUILD — donc avant tout export, sur tous les chemins, **Xcode Cloud compris**. C'est ce qui rend la distribution App Store depuis Xcode Cloud possible : le hook `ci_post_xcodebuild.sh` n'y suffit pas, il s'exécute après les exports (run 1742 : exports 19:11:06→19:11:09, hook 19:11:30). Ne jamais rétrograder ce correctif vers un hook post-archive.
- **Avant tout upload** : `./ci_scripts/verify_embedded_signatures.sh <ipa|app|xcarchive>`. Il vérifie l'autorité de signature **et** la cohérence identifier ↔ designated requirement — `codesign --verify` ne voit pas la seconde, et c'est elle qui a fait rejeter le 1742.
- **CI régénère le projet** : les workflows iOS lancent `cd apps/ios && xcodegen generate` AVANT de builder → CI compile toujours le vrai jeu de fichiers issu de `project.yml`. **`meeshy.sh` régénère, lui, uniquement SUR DÉRIVE CONSTATÉE** (`ensure_project_is_current`, appelée par `build`, `device`, `test`, `archive`, `distribute`) : elle compare les `.swift` sur disque aux références du pbxproj et n'appelle `xcodegen generate` que s'il en manque. Inconditionnelle, la régénération réécrirait `project.pbxproj` + `Meeshy.xcscheme` à chaque build dans un worktree partagé ; absente — l'état d'avant le 2026-08-15 — elle laissait la divergence produire des « cannot find type 'X' in scope » sur des types bien présents sur disque, et surtout des **suites de tests absentes du bundle, donc vertes par omission** (30 fichiers dérivés ce jour-là, dont 22 de tests). Sans `xcodegen` installé, la garde échoue TÔT avec la liste des fichiers et `brew install xcodegen`, au lieu de laisser le build échouer après plusieurs minutes.
- Le scheme partagé `Meeshy` provient de la clé `scheme.testTargets` du target (une clé `scheme:` top-level est silencieusement ignorée par XcodeGen et ferait disparaître le scheme à la régénération).

### Reproduire la CI « iOS Tests » fidèlement en local
`meeshy.sh` suffit pour le dev courant. Pour **reproduire un échec CI de compile/tests**, répliquer la CI exactement (NE PAS se fier à `meeshy.sh` seul) :
```bash
cd apps/ios && xcodegen generate && cd -                              # 1. régénérer comme CI (sinon divergence)
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build   # 2. compile app + tests
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests \
  -derivedDataPath apps/ios/Build                                     # 3. run sur 18.2 (réutilise la compile)
```
- **Compile = Xcode 26.1.1 (Swift 6.2)**, **run = simu iOS 18.2** (18.5+/26.x crashent au teardown xctest `swift_task_deinitOnExecutorMainActorBackDeploy` ; baselines snapshot enregistrées sur 18.2).
- `build-for-testing` puis `test-without-building` = compile une fois, exécute sans recompiler (réutilise `apps/ios/Build`, plus rapide que `meeshy.sh test`).
- **Nettoyer après** : `xcodegen generate` réécrit `project.pbxproj` + `Meeshy.xcscheme` ; la résolution SPM réécrit `Package.resolved` (tracké malgré `.gitignore`). Ce sont des artefacts → `git checkout --` dessus. **Ne jamais committer ce churn** depuis une repro locale (worktree partagé). Une exception, et une seule : les lignes qui AJOUTENT la référence d'un fichier neuf — celles que `ensure_project_is_current` fait apparaître — sont le correctif, pas du churn ; elles se committent.

### « TEST FAILED » / exit 65 = échec de COMPILE, pas un test flaky
`** TEST FAILED **` + `Testing cancelled because the build failed` (exit 65) = le bundle de tests n'a pas compilé/linké. Lire la ligne `error:` juste au-dessus et corriger la compile — ne pas fouiller la logique des tests.
- **Piège accès cross-file** : un `@State private var` d'une `View` SwiftUI est **inaccessible depuis un fichier d'extension `View+Xxx.swift`** (même module). Symptôme CI : `'<prop>' is inaccessible due to 'private' protection level`. Fix : retirer `private` (internal par défaut) sur toute propriété stockée touchée par un fichier extension frère. Cas vécu `composerFocusTrigger` (StoryViewerView ↔ StoryViewerView+Content.swift), corrigé 2026-06-23.

## Naming Conventions

Based on [Swift.org API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/):

| Category | Pattern | Example |
|----------|---------|---------|
| Views | `{Screen}View` | `ConversationView` |
| ViewModels | `{Feature}ViewModel` | `ConversationViewModel` |
| Services | `{Function}Manager` | `AuthManager`, `PresenceManager` |
| Models (API) | `API{Entity}` | `APIConversation` |
| Models (local) | `{Entity}` | `Conversation` |
| Components | PascalCase | `ChatBubble`, `MeeshyAvatar` |
| Protocols (what it is) | Nouns | `MessageProvider`, `AudioSource` |
| Protocols (capability) | `-able`/`-ible`/`-ing` | `Sendable`, `Cacheable`, `ProgressReporting` |
| Boolean properties | Reads as assertion | `isEmpty`, `isConnected`, `hasUnread` |
| Mutating methods | Imperative verb | `sort()`, `append()`, `disconnect()` |
| Non-mutating methods | Noun/past participle | `sorted()`, `appended()`, `disconnected()` |
| Factory methods | `make` prefix | `makeIterator()`, `makeRequest()` |

### API Design Principles (Apple Official)
- **Clarity at point of use** is the primary goal
- Include all words needed to avoid ambiguity: `remove(at: index)` not `remove(index)`
- Omit needless words that repeat type info: `func add(_ person: Person)` not `addPerson`
- Name by role, not type: `greeting` not `string`
- Methods with side-effects read as imperative verbs: `array.sort()`
- Methods without side-effects read as nouns: `array.sorted()`
- Computed properties with non-O(1) complexity must document it

## State Management
```swift
// Singletons (shared managers)
AuthManager.shared          // Login/logout, session
APIClient.shared            // HTTP requests
MessageSocketManager.shared // Real-time messages
SocialSocketManager.shared  // Social/presence events
PresenceManager.shared      // User online status
ThemeManager.shared         // Dark/light mode
AudioPlayerManager.shared   // Audio playback
MediaCacheManager.shared    // Disk caching

// Reactive patterns
@MainActor class ViewModel: ObservableObject {
    @Published var state: State
}

// View ownership
@StateObject var viewModel       // View-owned (ONLY when creating the instance)
@ObservedObject var manager      // Passed-in (NEVER for instantiation - causes re-creation)
@EnvironmentObject var shared    // App-wide singleton
```

### State Management Rules
- Use `@StateObject` when the View CREATES the object; `@ObservedObject` when RECEIVED
- Use `@State` for simple local values (Bool, String, Int)
- Use `let` for properties that never change during the view's lifetime (avoids needless dependency tracking)
- Minimize `@Published` properties: each one triggers view re-evaluation on change
- Derive computed state instead of storing redundant `@Published` values
- Never store view-only state (animations, scroll position) in ViewModels

### Bubble Component Architecture
La bulle de message est decomposee sous `Meeshy/Features/Main/Views/Bubble/`. Le god object historique a ete elimine — `ThemedMessageBubble.swift` est un orchestrateur fin (~265 lignes) qui :
1. Construit un `BubbleContent` (value model immuable) depuis le `Message` + contexte de traduction.
2. Dispatche sur `content.kind` (`.deleted` / `.burned` / `.standard`) vers `BubbleDeletedView`, `BubbleBurnedView`, ou `BubbleStandardLayout`.
3. Possede les `@StateObject` de cycle de vie (`BubbleEphemeralController`, `BubbleBlurRevealController`) et les `@State` de presentation (sheets, fullscreen) — passes aux sous-vues comme `@ObservedObject`/`@Binding`.

`BubbleStandardLayout` est l'orchestrateur du chemin standard. Il lit `content.text`, `content.attachments`, `content.reply`, `content.translation`, `content.reactions` via des `if let`/`switch` qui early-exit. Une bulle "Salut" n'instancie que le texte + meta-row : pas de quoted-reply, pas de panneau de traduction, pas de grille visuelle.

**Rule absolue : ne JAMAIS reintroduire de logique inline dans `ThemedMessageBubble` ou `BubbleStandardLayout` pour une nouvelle feature.** Toute nouvelle capacite passe par :
1. **Etendre `BubbleContent`** avec un champ optionnel typé (ex: `let highlight: Highlight?`).
2. **Creer une sous-vue dediee** `Bubble{Feature}.swift` Equatable, sous `Views/Bubble/`. Inputs primitifs (`isMe: Bool`, `accentHex: String`...) ; pas d'`@ObservedObject` sur des singletons globaux.
3. **Brancher conditionnellement** dans `BubbleStandardLayout` via `if let feat = content.feature { BubbleFeature(...) }`.

Ce design garantit le pattern "Zero Unnecessary Re-render" pour les cellules de liste : chaque sous-vue ne se re-evalue que si ses inputs Equatable changent, et les sous-vues absentes ne sont jamais instanciees.

Source de verite : `BubbleContent.swift` (value model), `BubbleContentBuilder.swift` (init + helpers purs testables `resolveEffectiveContent`, `buildAvailableFlags`, `summarizeReactions`).

## Networking
- REST: `APIClient` with `async/await`, generic `request<T: Decodable>()`
- WebSocket: Socket.IO with Combine `PassthroughSubject` for events
- Base URL configurable via UserDefaults (local vs remote)
- Date parsing: ISO8601 with fractional seconds
- Bearer token: `Authorization: Bearer {token}`

## Navigation
- **Hybrid NavigationStack + ZStack** pattern
- NavigationStack for hierarchical flows (conversation list → conversation detail)
- ZStack for overlays (feed, menu ladder, floating buttons)
- Router.swift (`Features/Main/Navigation/Router.swift`) manages NavigationPath
- `@Environment(\.dismiss)` for back navigation (replaces custom `onBack` callbacks)
- Native iOS swipe-to-back gesture (replaces custom DragGesture)

## Design System & Visual Identity

### Brand Identity — Indigo
The Meeshy brand is built on an **Indigo gradient** (`#6366F1` -> `#4338CA`), derived from the logo.
- **Light mode logo**: Indigo gradient background + white stacked-dashes icon
- **Dark mode logo**: Black background + Indigo gradient stacked-dashes icon
- The gradient is THE signature — used for CTAs, hero elements, and logo treatments

### Brand Color Scale (Indigo)
| Token | Hex | Role |
|-------|-----|------|
| `indigo50` | `#EEF2FF` | Tinted backgrounds (light) |
| `indigo100` | `#E0E7FF` | Hover/pressed states (light) |
| `indigo200` | `#C7D2FE` | Borders, subtle UI (light) |
| `indigo300` | `#A5B4FC` | Secondary elements |
| `indigo400` | `#818CF8` | Interactive elements (light) |
| **`indigo500`** | **`#6366F1`** | **Primary — gradient start** |
| `indigo600` | `#4F46E5` | Hovered primary |
| **`indigo700`** | **`#4338CA`** | **Primary deep — gradient end** |
| `indigo800` | `#3730A3` | Pressed states |
| `indigo900` | `#312E81` | Deep accents |
| `indigo950` | `#1E1B4B` | Darkest brand surface |

### Semantic State Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#34D399` | Sent, online, confirmed |
| `warning` | `#FBBF24` | Attention, pending |
| `error` | `#F87171` | Error, failure, disconnected |
| `info` | `#60A5FA` | Information, help |
| `readReceipt` | `#818CF8` | Read indicator (indigo400) |

### Theme Colors
**Light mode**: White/indigo-tinted backgrounds, indigo950 text, indigo200 borders
**Dark mode**: Near-black with indigo tint backgrounds, indigo50 text, indigo900 borders

### UI Components
- Glass UI: `.ultraThinMaterial` + indigo-tinted borders
- View modifiers: `.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`
- Haptics: `HapticFeedback.light()`, `.medium()`, `.success()`, `.error()`
- Animations: `.spring(response: 0.4-0.7, dampingFraction: 0.6-0.8)`
- Staggered delays: 0.04-0.05s per list item index

### Color Migration (Legacy -> New)
Old code uses deprecated aliases that map to the new palette:
| Old | New | Notes |
|-----|-----|-------|
| `MeeshyColors.pink` | `MeeshyColors.indigo500` | Brand primary |
| `MeeshyColors.coral` | `MeeshyColors.error` | Error/destructive |
| `MeeshyColors.cyan` | `MeeshyColors.indigo400` | Interactive |
| `MeeshyColors.purple` | `MeeshyColors.indigo600` | Hovered primary |
| `MeeshyColors.teal` | `MeeshyColors.indigo300` | Secondary |
| `MeeshyColors.green` | `MeeshyColors.success` | Success state |
| `MeeshyColors.orange` | `MeeshyColors.warning` | Warning state |
| `MeeshyColors.infoBlue` | `MeeshyColors.info` | Info state |
| `MeeshyColors.primaryGradient` | `MeeshyColors.brandGradient` | Signature gradient |

New code MUST use the Indigo scale or semantic names. Legacy aliases are `@available(*, deprecated)`.

## Prisme Linguistique — Implementation iOS

Le Prisme Linguistique garantit que l'utilisateur consomme le contenu dans sa langue preferee, de maniere transparente.

### Architecture cote iOS
```
ConversationViewModel
  ├── messageTranslations: [String: [MessageTranslation]]  → Cache des traductions par message
  ├── preferredTranslation(for:) → Resolution auto (miroir de resolveUserLanguage gateway)
  └── activeTranslationOverrides: [String: MessageTranslation?] → Override manuelle utilisateur

ThemedMessageBubble
  ├── effectiveContent → Affiche toujours la traduction preferee (ou original si aucune)
  ├── isDisplayingTranslation → true quand preferredTranslation existe
  ├── translationFlagStrip → Drapeaux de langue (original + systeme + regional/custom + deviceLocale, max 4)
  ├── flagButton → Drapeau cliquable avec underline colore et animation
  ├── secondaryLanguageCode → Code langue du contenu secondaire affiche (nil = rien)
  ├── secondaryContent → Contenu traduit/original pour la langue secondaire selectionnee
  └── secondaryContentView → Panneau inline (fond pastel, separateur colore, texte)

MessageMoreSheet → vue detail Langue (MessageLanguageDetailView)
  ├── Listing des langues avec preview de chaque traduction
  ├── Indicateurs de disponibilite (checkmark / bouton Traduire)
  ├── Selection d'une langue → callback vers ViewModel → mise a jour bulle
  └── Bouton retraduire (arrow.clockwise)
```

### Helper de normalisation locale appareil

Trois sites maintiennent un helper identique pour normaliser un identifier de langue vers ISO 639-1 (2 lettres lowercase) :
- `packages/shared/utils/language-normalize.ts` — source de vérité
- `MeeshyUser.normalizeLanguageCode` (SDK Swift)
- `ConversationLanguagePreferences.normalize` (app iOS)

Toute évolution de la logique de normalisation doit toucher les **trois** sites pour préserver la symétrie cross-platform.

### UX Translation Flow
- **Affichage par defaut** : `effectiveContent` retourne toujours `preferredTranslation.translatedContent` si disponible, sinon `message.content`
- **Indicateur discret** : Icone `translate` dans le meta row quand des traductions existent
- **Drapeaux** : Bande de drapeaux en bas du texte (original + systeme + regional/custom + deviceLocale, max 4, dedupliques)
- **Tap drapeau** : Affiche le contenu secondaire inline (fond pastel couleur langue, separateur colore)
- **Tap meme drapeau** : Masque le contenu secondaire avec animation
- **Long press** : Ouvre le menu unifie (`MessageOverlayMenu` : barre de reactions + bulle elevee + liste d'actions glass) ; « Traduire » ouvre la vue Langue du menu complet (`MessageMoreSheet`) ; swipe-up fort = « Plus… » (menu complet), swipe-down = fermeture (loi : `MessageOverlayDragLaw`)
- **Tap icone translate** : Ouvre directement la vue Langue
- **Selection langue** : Met a jour la bulle via `activeTranslationOverrides` dans le ViewModel

### Regles
- Ne JAMAIS afficher de popup ou banniere pour indiquer une traduction — c'est un indicateur subtil dans le meta row
- Le contenu traduit doit s'afficher EXACTEMENT comme du contenu natif (meme style, meme layout)
- La resolution automatique de langue doit etre instantanee (pas de loading pour les traductions deja cachees)
- La vue Langue du MessageMoreSheet est le SEUL point d'entree pour explorer les traductions (pas de sheet separee)

## Attachment Size Display Before Download

Conventions pour l'affichage de la taille de fichier sur un attachment non telecharge (quand `MediaDownloadPolicyEngine.shouldAutoDownload` bloque l'auto-DL) :

| Type | Composant | Layout |
|---|---|---|
| Video | `DownloadBadgeView(compact: true)` | Pill coin bas-droit avec icone + taille |
| Image | `DownloadBadgeView(compact: false)` | Cercle 56pt centre + pill taille sous |
| Audio | `AudioPlayerView.playButtonLabel` | Cercle play-button + label taille sous (parite visuelle) |

Source de verite : `attachment.fileSize` (Int, bytes) hydrate par le payload REST `/messages` et le payload socket `message:new` (ce dernier via `serializeAttachmentForSocket` cote gateway). Si la taille est 0, le label n'apparait pas (no-op).

Le label audio est rendu par les helpers purs `AudioPlayerView.formattedNeedsDownloadLabel` / `formattedDownloadingLabel` / `formatBytes` (tests dans `MeeshyUITests/Media/AudioPlayerViewLabelTests.swift`).

Pendant le telechargement, le label passe a `"410 KB / 850 KB"` via le payload `.downloading(progress:downloadedBytes:totalBytes:)` enrichi de `AudioAvailability`. `AudioMediaView` et `AudioAvailabilityResolver` propagent les bytes depuis `AttachmentDownloader.downloadedBytes` / `totalBytes`.

## Attachment Enrichment Atomicity

Quand un audio est recu (REST ou socket) et que sa transcription / ses traductions audio arrivent, l'app doit poser le tout dans un seul slice MainActor pour eviter le pop-in :

1. **Ouverture de conversation** : `ConversationViewModel.loadMessages` appelle `messageStore.loadInitialSnapshot()` (off-MainActor, ne mutate pas `@Published messages`), puis dans un meme bloc synchrone : `messageStore.apply(records:)` + `hydrateMetadataFromGRDB(from: snapshot)`. Aucun `await` entre la pose des messages et celle des metadonnees audio.
2. **Refresh REST background** (`refreshMessagesFromAPI`) : meme triplet snapshot/apply/hydrate apres `upsertFromAPIMessages`.
3. **Socket temps reel** (`message:attachment-updated`) : `ConversationViewModel.applyAttachmentUpdate` injecte directement `messageTranscriptions[id]` et `messageTranslatedAudios[id]` depuis le payload (`injectAttachmentMetadata`). Le client gateway emet ce delta apres tout enrichissement async (Whisper, NLLB+TTS).

Regle stricte : ne JAMAIS introduire d'`await` entre `messages = …` et `messageTranscriptions = …` / `messageTranslatedAudios = …` — sinon SwiftUI rend les bulles audio sans leur transcription puis re-rend, et l'utilisateur voit un flash a ~1s.

Source : `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.

## Story Architecture — RAW publish + author-only export

Stories Meeshy se publient **RAW** au backend :
- Assets individuels et réutilisables (background video / image, voice, foreground images / videos, audio) via TUS pre-upload
- `StoryEffects` JSON (texte, keyframes, transitions, filtres, opening, clipTransitions)

Le backend **ne stocke jamais** de MP4 baked composite. Les viewers re-rendent localement en suivant le **Prisme Linguistique** (texte / audio retraduits par viewer dans sa langue préférée).

Le MP4 export (`StoryVideoExportService` + `StoryExporter`) est une feature **auteur-only**, partage externe via `UIActivityViewController` (Photos / Messages / WhatsApp / AirDrop) — **NE TOUCHE JAMAIS LE BACKEND MEESHY**.

### Entry point
- `StoryViewerView` → bouton "Exporter" dans `storyActionSidebar`, visible dès que l'utilisateur est l'auteur (`currentGroup?.id == currentUser.id`)
- **Universal export** : toute story de l'auteur est exportable, qu'elle contienne de la vidéo/audio/keyframes OU juste du texte/sticker/image statique. Le compositor synthétise un substrat vidéo transparent pour les slides sans background (cf. `StoryExporterStaticOnlyTests`)
- Le tap présente `StoryExportShareSheet` driven par `StoryExportShareViewModel`
- Le sheet expose un picker de langue d'export (Prisme Linguistique) → la langue choisie est gravée dans le MP4 (texte des overlays)

### Règle absolue
`StoryViewModel.runStoryUpload` NE DOIT JAMAIS invoquer `prepareExport` ou `StoryExporter.export`. Toute future tentative d'optimisation "bake en amont du publish" doit être rejetée — elle détruit la réutilisabilité et la retraduction par viewer.

Source : `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`

## Effets de message (`Message.effectFlags`)

Le bitfield `effectFlags` est persisté par le gateway et lu par TOUS les clients. Trois axes : cycle de vie (`ephemeral`/`blurred`/`viewOnce`, gérés par les contrôleurs de bulle), apparition one-shot (`shake`/`zoom`/`explode`/`confetti`/`fireworks`/`waoo`), persistants (`glow`/`pulse`/`rainbow`/`sparkle`).

**Sources de vérité jumelles — toute évolution de la règle touche les deux :**
- Swift : `MessageEffectPlan` (`packages/MeeshySDK/.../Models/MessageEffects.swift`)
- TypeScript : `resolveMessageEffectPlan()` (`apps/web/lib/message-effects.ts`)

Bits partagés : `packages/shared/types/message-effect-flags.ts` ↔ `MessageEffectFlags`.

### Deux horloges — ne jamais les confondre
| Horloge | Déclencheur | Exemples |
|---|---|---|
| **Réception** | arrivée du message (donnée) | compteur d'un message éphémère, `expiresAt` |
| **Affichage** | venue à l'écran (vue) | flou d'un message protégé (se déclenche à l'ouverture), **tous les effets d'apparition** |

### Règles
1. **Un effet d'apparition joue une fois PAR AFFICHAGE À L'ÉCRAN**, pas une fois par message. Rouvrir la conversation, ou refaire défiler la bulle à l'écran, le rejoue. « Une fois » borne l'effet à une exécution PENDANT un affichage : il ne boucle pas. Il n'existe donc **aucune mémoire de lecture** — ni store, ni Set, ni booléen persisté ; exactement comme `BubbleBlurRevealController`, qui n'en a pas non plus.
2. **Ne JAMAIS basculer un drapeau « déjà joué » dans un `.onAppear` frère de celui qui démarre l'animation.** C'est le défaut corrigé le 2026-08-13 : `ThemedMessageBubble` posait `.messageEffects(...)` puis `.onAppear { hasPlayedAppearance = true }`, donc le changement d'état re-rendait la bulle avec `active == false` dans la MÊME passe et coupait chaque animation avant la première frame — aucun effet d'apparition n'était jamais visible en conversation.
3. **Un effet one-shot doit être REJOUABLE, pas seulement jouable au montage.** `onAppear` peut retrouver la phase déjà à `1` (vue conservée, conversation rouverte) : la remettre à `0` puis l'animer dans le même tour synchrone ne produit rien, faute de frame de départ à interpoler. iOS réarme via `AppearancePhaseDriver` (phase `0 → 1` + délai d'une frame) ; le web, dont une animation CSS ne rejoue qu'au montage, réarme via `IntersectionObserver` + retrait/repose des classes à la frame suivante — jamais en remontant `children`, ce qui réinitialiserait le DOM de la bulle.
4. **Une secousse se fait avec un `GeometryEffect`, jamais avec un `.offset` calculé.** `.offset(x: sin(phase * .pi * 4) * 8)` animé `phase: 0 → 1` ne bouge PAS : SwiftUI interpole la valeur produite, et `sin(0) == sin(4π) == 0`. Seul `animatableData` fait parcourir la courbe.
5. **Les particules se décrivent en coordonnées relatives figées + une progression animée**, jamais en mutant un `@State` vide depuis `onAppear` puis en l'animant dans le même tour : sans frame initiale rendue, il n'y a rien à interpoler.
6. **`reduceMotion` : le message perd son mouvement, pas son intention.** Aucune apparition ne joue ; `glow` et `rainbow` sont rendus FIXES (`reduceMotionSafeMask`) ; `pulse` et `sparkle` sont du mouvement pur et sont retirés.
7. **Plan vide ⇒ vue intacte.** `plan.isEmpty` doit court-circuiter tout wrapper : l'écrasante majorité des messages a `effectFlags == 0` et ne doit pas payer huit ViewModifier inertes par cellule.
8. **Un effet déclaré doit être MONTÉ.** `ExplodeOverlay` et `WaooOverlay` ont vécu déclarés et jamais branchés : `explode` et `waoo` jouaient leur transform pendant que leurs particules ne s'exécutaient jamais, et rien ne rougissait — le plan de lecture était correct, les vues compilaient, et l'effet PARAISSAIT jouer grâce à son transform. Garde : `EffectOverlayMountingSourceGuardTests` exige l'égalité entre overlays déclarés et overlays montés, chacun derrière son propre drapeau.
9. **Le 4ᵉ axe « interface » (bits 24-30) n'existe pas encore, et le bit 31 est interdit.** Les trois axes actuels s'appliquent tous à la VUE DU MESSAGE ; aucun effet ne s'exerce à l'échelle de l'écran. Si cet axe s'ouvre : `1 << 31` vaut **−2147483648** en TypeScript (opérateurs bit-à-bit en int32 signé) et dépasse l'`Int` signé stocké par Prisma — un drapeau posé là serait négatif côté web et positif côté Swift (`UInt32`). Sept emplacements utilisables, pas huit.

## TDD & Testing Standards

### Test Organization
```
MeeshyTests/
├── Unit/
│   ├── ViewModels/     → ViewModel behavior tests
│   └── Services/       → Service logic tests
├── Mocks/              → Protocol-conforming mock classes
├── Helpers/            → JSONStub, factory functions
└── Snapshots/          → Visual regression tests (future)
```

### Mock Convention
- Name: `Mock{ServiceName}` (e.g., `MockConversationService`)
- Conform to `{ServiceName}Providing` protocol
- Properties: `var {method}Result: Result<T, Error>`, `var {method}CallCount: Int`, `var last{Method}{Param}: Type?`
- Include `func reset()` to clear all tracking state
- Use `nonisolated` for protocol methods, `await MainActor.run {}` for state mutation

### Test Pattern
```swift
@MainActor
final class SomeViewModelTests: XCTestCase {
    // Factory function — NOT setUp/tearDown mutation
    private func makeSUT(...) -> (sut: SomeViewModel, mock: MockService) {
        let mock = MockService()
        let sut = SomeViewModel(service: mock)
        return (sut, mock)
    }

    func test_loadData_success_populatesList() async {
        let (sut, mock) = makeSUT()
        mock.listResult = .success([...])
        await sut.loadData()
        XCTAssertEqual(sut.items.count, 2)
    }
}
```

### Rules
- Test **behavior**, not implementation details
- One assertion focus per test (multiple XCTAssert for same behavior is fine)
- Use factory functions (`makeSUT()`, `makeMessage()`) — no shared mutable state
- Fire-and-forget Tasks: use `XCTestExpectation` with callbacks, not `Task.sleep`
- `@MainActor` on ALL test classes that test `@MainActor` ViewModels
- Default param trick for `@MainActor` mocks: use `Type? = nil` + coalescing inside function

## Le composer met ses portes SUR LE PLATEAU, et les répartit par NIVEAU (directive porteur 2026-08-31)

> « Cette approche est meilleure, ce qui permet de manipuler tout le canvas sans
> problème : on exploite la place du plateau sans encombrer le canvas. […] On
> préserve des actions sur la ligne canonique comme la description du contenu,
> l'ajout de son de fond, image et vidéo de fond, mention et localisation de la
> publication ; et sur la rangée à gauche, ce sont les features qui apparaissent
> sur le canvas visuellement. »

### 1. Aucun contrôle ne se pose SUR la scène

Les rails, les contrôleurs et les portes vivent **dans les couloirs du plateau**,
jamais en surimpression du canvas. Deux raisons, et la seconde est celle que la
directive ajoute :

- **loi 6** — un contrôle posé sur la scène fait mentir l'aperçu sur le rendu
  final : l'auteur compose avec des pixels qui ne partiront pas ;
- **la manipulation** — un objet se déplace, se pince et se tourne *n'importe où*
  dans le cadre. Un rail flottant vole les touches de la bande qu'il couvre, et
  l'auteur découvre la zone morte en essayant d'y traîner quelque chose.

Le plateau est de la place DISPONIBLE : la scène est figée en 9:16 et l'écran ne
l'est pas. L'occuper ne coûte rien ; occuper le canvas coûte une zone morte.

> Un arbitrage antérieur (2026-08-28) avait posé le rail **à droite, dans la
> scène**, en s'appuyant sur les quatre bulles de la planche `1b`. Cette
> directive le remplace. Un doc-comment qui décrit l'ancien arbitrage est un
> piège au sens du § *contrôle inerte* : il énonce une raison juste pour une
> disposition qui n'est plus celle du produit.

### 2. La place d'une porte se lit à son NIVEAU, jamais à une liste

`ComposerRailDoor.level` classe déjà chaque porte, avec un `switch` exhaustif :
`.publication`, `.slide`, `.object`, `.scene`. **C'est lui qui décide où la porte
se pose**, et aucune liste écrite à la main ne double cette décision.

| ce que la porte vise | où elle se pose | pourquoi |
|---|---|---|
| `.object` · `.scene` — ce qui APPARAÎT visuellement sur le canvas (texte, dessin, sticker, média de premier plan, son posé) | **rangée de gauche**, sur le plateau | le geste part de la colonne et atterrit sur la scène : la main suit le sens de l'action |
| `.publication` · `.slide` — ce qui appartient à l'ENVOI ou à la slide (description du contenu, son de fond, image/vidéo de fond, mention, localisation de la publication) | **ligne canonique**, en bas | rien de tout cela n'a de place sur la scène ; le bas est déjà la zone de ce qui décide de l'envoi (loi 5) |

**Le même média n'est pas la même porte selon son PLAN.** Une image de FOND
appartient à la slide et vit en bas ; une image de PREMIER PLAN devient un
`MeeshyObject` et vit à gauche. Idem pour le son : un son de fond est un attribut
de la publication (il porte son crédit au socle), un son POSÉ est un objet
visible. Ranger les deux sous une seule porte « média » ou « son » est ce qui
rend la sémantique illisible pour l'auteur.

### Le témoin

Une garde compare la répartition rendue à `ComposerRailDoor.level` — jamais à une
liste recopiée. Une neuvième porte ne peut alors pas naître sans dire de quel
niveau elle est, et son niveau la range tout seul.

### 2 bis. Les TROIS zones du plateau, et sur quoi chacune agit (directive porteur 2026-08-31, révision)

> « Ce qui est affiché **en bas du plateau lorsqu'aucun outil n'est actif** agit
> sur le canvas de manière générale. À **gauche** du plateau, ce sont les
> contrôles qui agissent sur les **objets du slide**. À **droite**, ça agit sur
> les **dimensions des objets**, + undo/redo devrait y être, + création d'un
> autre slide dès lors qu'on a déjà un slide de créé. »

Cette formulation PRÉCISE celle du § 2. Elle ne parle plus de « ce qui apparaît
visuellement » mais de **sur quoi le contrôle agit** — et les deux coïncident
pour les portes, tout en tranchant ce que la première laissait flou : la place
des contrôleurs, de l'historique et de la création de slide.

| zone | agit sur | contenu |
|---|---|---|
| **bas du plateau** (aucun outil actif) | le CANVAS en général | ce qui vaut pour la scène entière ou la publication — fond, description, mention, lieu |
| **gauche** | les OBJETS du slide | les portes qui posent ou éditent un objet — média, sticker, dessin, texte |
| **droite** | les DIMENSIONS des objets | empilement, duplication, suppression, rognage — **plus l'historique (undo/redo)** et **la création d'une autre slide** |
| **bas, un outil ouvert** | l'OUTIL en cours | ses contrôleurs, qui prennent la place de la zone « canvas » |

**Ce que la révision déplace, et qui reste à faire :**

- **undo / redo quittent le socle pour le rail DROIT.** Ils agissent sur ce qui
  a été fait aux objets, pas sur l'envoi ; au socle, ils voisinaient avec
  l'audience et le bouton publier, qui décident de la publication.
- **la création d'une slide est CONDITIONNELLE** : « dès lors qu'on a déjà un
  slide de créé ». Le `[+]` est aujourd'hui monté sans condition.

**Le son n'a plus de porte** (même directive) : il n'y a qu'une façon d'ajouter
un son sur le canvas — une chip redimensionnable et déplaçable, par la palette
du § 3 — et le son de FOND reste au socle. La porte du rail ouvrait la MÊME
feuille que la pastille du socle (`presentedPortal = .sound`, ligne pour ligne) :
c'était un bouton en double, jamais une capacité en double.

> **Vérifier LAQUELLE des deux avant de retirer est ce qui sépare une
> déduplication d'une régression.** Deux boutons qui ouvrent la même feuille se
> retirent l'un l'autre sans rien coûter ; deux boutons qui ouvrent deux
> chemins obligent à choisir lequel survit — et à le dire.

### 3. Une porte n'a pas de JUMELLE — on ouvre une palette, on n'ajoute pas une icône

> « Dans l'icône (smile/sticker) il faudra juste proposer directement des
> constructions permettant de mettre des chips de lieu (en prenant les lieux
> autour), des chips de son (en permettant de choisir lequel), etc. — qu'on peut
> positionner, grandir sur la scène. **Ça évite d'avoir plusieurs icônes
> redondants aux icônes canoniques** qui concernent le document ou métadonnée du
> slide. » (directive porteur 2026-08-31)

Deux icônes qui se ressemblent et agissent sur deux NIVEAUX différents ne se
distinguent pas à l'œil — le niveau est invisible, seul le glyphe se voit. Un ♪
qui pose un son sur la scène et un ♫ qui choisit le son de fond de la
publication sont, pour l'auteur, le même bouton à deux endroits.

**La règle** : quand une intention nouvelle POSE un objet sur la scène, elle
entre dans la **palette de constructions** (derrière l'entrée sticker), jamais
dans la rangée comme une icône de plus. La rangée nomme des FAMILLES ; la palette
nomme des constructions.

| ce qu'on ajoute | où ça va |
|---|---|
| une construction qui pose un objet sur la scène (chip de lieu, chip de son, sondage, minuteur…) | la **palette**, derrière `sticker` |
| une entrée qui vise la publication ou la slide | la **ligne canonique** |
| une famille entièrement nouvelle de matière | et seulement alors, une porte |

**Le témoin** : aucune porte de la rangée de gauche ne pose un objet qu'une
entrée canonique pose déjà. C'est la formulation vérifiable de « éviter plusieurs
icônes redondants » — elle s'éprouve sur les niveaux, pas sur les glyphes.

Pilotage : #4579.

## Les gestes de glissement sont PROGRESSIFS et ANNULABLES (directive porteur 2026-08-30)

> « Il faut préférer ce type de swipe À CHAQUE FOIS qu'on parle de mettre un
> swipe : c'est un swipe progressif et annulable jusqu'à 75-90 % de la fin. »

**Un glissement n'est pas un déclencheur.** Tout geste de glissement que l'app
propose doit :

1. **suivre le doigt image par image** — ce qu'il déplace bouge pendant le geste,
   pas à la levée du doigt ;
2. **rester annulable jusqu'à 75-90 %** de sa course — revenir en arrière sans
   relâcher restaure l'état d'avant, sans effet de bord ;
3. **emmener AVEC lui ce qui l'accompagne** — clavier, feuille, barre : le geste
   les pousse ensemble, il ne les fait pas disparaître l'un après l'autre.

### Ce que cela interdit

`DragGesture().onEnded { … }` comme unique porteur d'une décision. Il DÉCIDE à la
levée du doigt : rien ne bouge pendant, rien n'est annulable, et l'ordre des
disparitions n'est pas celui du geste. Un seuil (`translation.height > 40`) n'y
change rien — il déplace le point de bascule, il ne rend pas le geste progressif.

### Ce qu'il faut employer

| besoin | mécanisme |
|---|---|
| renvoyer le clavier | `.scrollDismissesKeyboard(.interactively)` — le clavier suit le doigt et remonte si on relâche avant la fin |
| refermer une feuille | les détentes système (`presentationDetents`), qui portent déjà le suivi et l'annulation |
| déplacer un élément | `DragGesture().onChanged` qui pilote une valeur rendue, `.onEnded` ne servant qu'à CONCLURE une animation déjà en cours |

**Le mécanisme système est préféré au geste maison** : une imitation écrite à la
main diverge du reste de l'OS — seuil différent, courbe différente, pas de
retour arrière — et l'utilisateur le sent avant de savoir le nommer.

### Le témoin

Un glissement écrit à la main se reconnaît à un `onEnded` qui décide sans
`onChanged` qui montre. Là où un mécanisme système existe pour le même acte,
c'est lui qu'on emploie ; là où il n'en existe pas, le geste porte sa progression
dans une valeur rendue, et son annulation est éprouvée — pas supposée.

Précédent : la zone de description du composer (#4361) est passée d'un
`DragGesture.onEnded` avec seuil à `.scrollDismissesKeyboard(.interactively)`,
sur cette directive.

## Cache-First Pattern (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Pattern I1

Every ViewModel loading data MUST:
1. Call `CacheCoordinator.shared.{store}.load(for: key)` BEFORE any API request
2. Distinguish `.fresh` / `.stale` / `.expired` / `.empty` in a switch
3. Display `.stale` immediately + silent background refresh
4. NO spinner when cached data exists
5. Show a SKELETON (not a ProgressView) on empty cache

**`SkeletonPlaceholder` n'existe pas — c'est un nom générique de la bible.** Le
dépôt le réalise sous des noms de DOMAINE, un par forme de contenu, et la
matrice du Pattern I4 en nomme cinq (garde : `SkeletonColdStartGuardTests`) :

| écran | composant | où il vit |
|---|---|---|
| Liste conversations | `SkeletonConversationRow` | SDK — `MeeshyUI/Primitives/SkeletonView.swift` |
| Messages | `SkeletonMessageBubble` | SDK — idem |
| Feed | `SkeletonFeedList` (→ `SkeletonFeedPost`) | app — `Views/Skeletons/` |
| Stories | `SkeletonStoryTrayRow` (→ `SkeletonStoryThumb`) | app — `Views/Skeletons/` |
| Profil | `SkeletonProfileHeader` | app — `Views/Skeletons/` |

Six autres écrans en ont un sans que la bible l'ait exigé : `ContactsSkeletonList`,
`SkeletonLinkRow`/`SkeletonLinkList`, `LentilleSkeletonRow`, `NearbySkeletonRow`,
`LivingSummarySkeleton`. Un squelette neuf se bâtit sur `SkeletonShape` +
`skeletonShimmer()` (Reduce Motion géré par `ShimmerModifier`), et chaque rangée
porte `.accessibilityElement(children: .ignore)` + un libellé de chargement.

### LoadState Enum
Every data-loading ViewModel MUST expose `loadState: LoadState`:
```swift
enum LoadState {
    case idle, cachedStale, cachedFresh, loading, loaded, offline, error(String)
}
```

### Leaf Views — Zero @ObservedObject Singleton
Views rendered in loops (ThemedMessageBubble, MeeshyAvatar, ThemedConversationRow)
MUST NOT have `@ObservedObject` on global singletons.
Pass `isDark: Bool`, `accentColor: String` as `let` parameters.
Alternative: `@Environment(\.colorScheme)` for simple dark/light checks.

## Notifications In-App — Architecture a deux etages (NON NEGOTIABLE)

Meeshy a **deux** systemes de toasts in-app, separes par **source d'evenement**. Ils ne doivent JAMAIS s'afficher en meme temps pour le meme evenement.

### Les deux systemes

| Systeme | Role | Source | Lieu | Visuel |
|---|---|---|---|---|
| **`FeedbackToastManager`** (app) | Feedbacks LOCAUX sur operations utilisateur (publication story OK, like, erreurs API d'actions) | Code app (ViewModel apres async call) | `apps/ios/Meeshy/Features/Main/Services/FeedbackToastManager.swift` | Pill 1-ligne (icone + texte), tap optionnel pour ouvrir le resultat (story publiee, post cree) |
| **`NotificationToastManager`** (SDK) | Alertes BACKEND -> client : push APN en foreground, evenements socket `notification:new` (message recu, etc.) | Reseau (socket / APNs) | `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift` | Card riche : avatar + nom expediteur + titre conv, tap = deep link vers conv |

### Regles (imperatif)

1. Toute notification **issue d'un evenement reseau** (socket entrant, push APNs en foreground, callKit) -> `NotificationToastManager.shared`. JAMAIS via `FeedbackToastManager`.
2. Tout feedback **resultat d'une action utilisateur locale** (login OK, erreur reseau au like, story publiee, etc.) -> `FeedbackToastManager.shared.showSuccess/.showError/.show`. JAMAIS via `NotificationToastManager`.
3. Les deux ne **doivent jamais** s'afficher en meme temps pour le meme evenement. Si un evenement declenche les deux, c'est une violation des regles 1 ou 2.
4. **Aucun appel cross-domain** : un ViewModel n'appelle JAMAIS `NotificationToastManager`, un socket listener n'appelle JAMAIS `FeedbackToastManager`.

### Ce qui N'est PAS de ce perimetre (gestion de l'entite Notification)

Les composants suivants gerent l'**entite** Notification (CRUD, listing, preferences) — distincts du toast in-app. A ne pas confondre :

- `NotificationModels`, `NotificationContext`, `APINotification`, `SocketNotificationEvent` (types)
- `NotificationCoordinator` (unread count global, badge, widget)
- `PushNotificationManager` (APN/Firebase plumbing)
- `NotificationService` (REST CRUD)
- `NotificationListView`, `NotificationRowView`, `NotificationSettingsView` (UI listing/prefs)
- `UserNotificationPreferences+Filter`
- `apps/ios/.../Features/Stories/Notifications/*` (independant story-specific)

## App Extensions
- **MeeshyNotificationExtension** (rich push) — cible `app-extension` dans `project.yml`.

  **La bulle PRÉ-ENREGISTRÉE (`prePersistMessage`) obéit à deux verrous, et aucun
  ne subsume l'autre** (cycle 125) :
  1. **le TYPE** — quatre familles de push portent un `messageId`, et une seule
     famille l'utilise pour désigner un message qui ARRIVE. `message_reaction`
     nomme le message RÉAGI (que le destinataire a le plus souvent écrit) et
     porte le `senderId` du RÉACTEUR. Le gate vit dans
     `NotificationPayloadHelpers.messageArrivalTypes`.
  2. **la LIGNE** — une bulle pré-enregistrée est un PLACEHOLDER pour la fenêtre
     qui précède la synchro REST : l'écriture est un `INSERT`, **jamais** un
     `save()`/UPSERT. `localId` est la clé primaire de `messages` ; un UPSERT
     réécrit TOUTES les colonnes de la ligne canonique.

  Corollaire de contrat : **toute clé lue dans `userInfo` se vérifie contre son
  ÉMETTEUR, sous son nom exact.** Deux cycles consécutifs y ont trouvé leur
  défaut principal — `content`/`originalLanguage` jamais émis (124), `senderName`
  lu sous un nom qu'aucun producteur n'écrit (125) — et les deux lectures
  compilaient en rendant un repli plausible. Le payload étant un
  `Record<string,string>`, une clé absente y voyage comme `''` : distinguer
  « absent » de « vide » se fait UNE fois, à la lecture.

  Ce qui se décide sans la base vit dans `NotificationPayloadHelpers.swift`
  (Foundation pur, compilé DANS `MeeshyTests` via `project.yml`) — c'est la
  seule façon dont du code d'`app-extension` devient interrogeable.
- **MeeshyWidgets** (home screen) — cible `app-extension` (iOS 17+).
- **MeeshyShareExtension** (« Share to Meeshy ») — cible `app-extension` recâblée 2026-06-24
  (était sur disque mais absente de `project.yml` → jamais compilée). `ShareViewController`
  est programmatique (héberge SwiftUI), Info.plist via `NSExtensionPrincipalClass` (pas de
  storyboard), auto-contenu (frameworks système + App Group `group.me.meeshy.apps`,
  entitlements `MeeshyShareExtension/MeeshyShareExtension.entitlements`).
  **Embarquée dans l'app depuis 2026-07-28** : `- target: MeeshyShareExtension` est de retour
  dans les `dependencies` de Meeshy (phase « Embed Foundation Extensions »), l'App ID
  `me.meeshy.app.share-extension` (QA8KGP7U96) est enregistré au portail avec APP_GROUPS, et
  le bundle id figure dans `fastlane/Matchfile` + les lanes `sync_certificates`/`force_sync`.
  **Câblée produit depuis 2026-07-29** — extension AUTONOME : elle lit la session dans
  l'App Group (`meeshy_active_user_id` → Keychain `meeshy_token_<userId>`, groupe partagé
  `<TEAMID>.me.meeshy.app`, d'où le `keychain-access-groups` ajouté aux entitlements),
  liste les vraies conversations (`recent_conversations` enrichie par
  `conversation_snapshots`), et poste elle-même `POST /api/v1/conversations/:id/messages`.
  Elle n'ouvre JAMAIS l'app.
  - **Portée lot 1 : texte + URL.** L'`Info.plist` n'annonce que `SupportsText` +
    `SupportsWebURL` — s'annoncer pour une image qu'on ne sait pas envoyer ferait
    apparaître Meeshy dans la feuille de partage de Photos pour y échouer. Les images et
    vidéos reviendront avec le pipeline TUS (lot 2), leur règle d'activation EN MÊME TEMPS.
  - **Échec d'envoi = relais durable, jamais une perte** : `ShareSender` dépose
    `share_pending_sends/<clientMessageId>.json` dans le conteneur App Group ;
    `SharePendingSendConsumer` (app) le verse dans l'`OfflineQueue` au boot et au retour en
    avant-plan. Le `clientMessageId` est repris à l'identique → le gateway dédoublonne, donc
    un POST abouti dont la réponse s'est perdue ne produit pas de doublon au rejeu.
  - **Aucun jeu de données de repli.** Sans session ou sans conversation, l'écran l'affiche
    explicitement. L'ancien `ContactPreview.sampleContacts` masquait une lecture morte
    derrière trois contacts crédibles — c'est ce qui a permis à la panne de survivre aux
    itérations d'audit 220i/221i/222i. `ShareExtensionSourceGuardTests` interdit son retour.
  - Helpers purs (`ShareSession`, `ShareConversationStore`, `ShareSender`) compilés AUSSI
    dans `MeeshyTests` via `project.yml` (motif `NSEDecryptor`) — `ShareViewController`
    (UIKit+SwiftUI) reste hors du bundle, toute sa logique décidable en a été extraite.
    Ces types sont `nonisolated` **sur le type ET sur leurs extensions** : la cible compile
    sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous `nonisolated`.
  - `meeshy_api_base_url` est désormais ÉCRITE par l'app (`WidgetDataManager.publishAPIBaseURL`).
    `NSEDataSync` la documentait depuis toujours comme écrite par l'app sans que personne
    ne l'écrive. **Impact nul en production** (le repli EST `gate.meeshy.me`) ; l'écart ne
    mordait qu'en staging et en dev, où la NSE interrogeait la prod pendant que l'app
    tapait ailleurs.
  - **Signature : aucune action au portail.** Vérifié par un build device Release SANS
    `-allowProvisioningUpdates` → le `.xcent` porte bien
    `keychain-access-groups = ["D72UK7R5RE.me.meeshy.app"]`. Les profils (Xcode-managed et
    `match AppStore`) accordent `D72UK7R5RE.*`, qui le couvre.
    Contrôle : `find apps/ios/Build -name "MeeshyShareExtension.appex.xcent" -newermt "-10 minutes" -exec plutil -p {} \;`
    — filtrer sur la FRAÎCHEUR : `Build/Meeshy.build/` est un résidu d'anciens builds,
    l'actif est `Build/Intermediates.noindex/Meeshy.build/`.
- **App Intents (Siri/Shortcuts)** — `Meeshy/Features/Intents/MeeshyAppIntents.swift`,
  compilé **dans le target app** (pas d'extension séparée : les `AppIntent` définis par
  l'app sont exposés à Siri/Shortcuts automatiquement). Recâblé 2026-06-24 depuis l'ancien
  dossier orphelin `MeeshyIntents/` (Info.plist SiriKit legacy incohérent, supprimé). Les 4
  intents deep-link (`meeshy://`) + `MeeshyAppShortcuts` sont gatés `@available(iOS 18.0, *)`
  car ils utilisent `OpenURLIntent` (iOS 18+) ; l'app garde son plancher iOS 16.

## Configuration (xcconfig)
| Config | API URL | Features |
|--------|---------|----------|
| Debug | localhost:3000 | Logging, debug menu |
| Staging | staging.meeshy.me | Crash reporting |
| Production | gate.meeshy.me | Crash reporting |

## Code Organization
- `// MARK: - SectionName` to divide file sections
- Extensions group protocol conformances
- Private properties/methods clearly marked
- One class/struct per logical responsibility

---

# Swift & iOS Best Practices

Based on Apple's official guidelines, WWDC sessions, and Swift.org documentation.

## Value Types vs Reference Types

Prefer `struct` over `class` by default (Apple WWDC guidance):

```swift
// CORRECT: Value type for data models
struct Message: Identifiable, Codable {
    let id: String
    let content: String
    let timestamp: Date
    let senderId: String
}

// CORRECT: Reference type only when identity/shared mutable state is needed
@MainActor class ConversationViewModel: ObservableObject {
    @Published private(set) var messages: [Message] = []
}
```

### When to use `struct`
- Data models, DTOs, configuration
- Immutable or copy-on-write semantics
- No need for inheritance
- Thread-safe by default (value types are copied across boundaries)

### When to use `class`
- ViewModels (`ObservableObject` requires class)
- Shared mutable state (managers, services)
- Identity matters (two instances are NOT the same even with equal values)
- Interop with Objective-C frameworks

## Protocol-Oriented Programming

Design with protocols first, concrete types second ([WWDC19: Modern Swift API Design](https://developer.apple.com/videos/play/wwdc2019/415/)):

```swift
// Define capability as protocol
protocol MessageSending {
    func send(_ message: Message, to conversation: Conversation) async throws
}

// Conform concrete types
class MessageSocketManager: MessageSending {
    func send(_ message: Message, to conversation: Conversation) async throws { ... }
}

// Depend on abstraction, not concretion
class ConversationViewModel: ObservableObject {
    private let messageSender: MessageSending  // Protocol, not concrete type

    init(messageSender: MessageSending = MessageSocketManager.shared) {
        self.messageSender = messageSender
    }
}
```

### Protocol Rules
- Use protocols to define **behavior contracts** (not data shapes)
- Name protocols that describe "what it is" as nouns: `AudioSource`
- Name protocols that describe capability with `-able`/`-ing`: `Cacheable`, `ProgressReporting`
- Prefer protocol composition over inheritance: `Codable & Identifiable & Hashable`
- Use protocol extensions for default implementations shared across conforming types
- Avoid protocol overuse: concrete types are fine when abstraction adds no value

## Memory Management (ARC)

Swift uses Automatic Reference Counting. Retain cycles are the #1 source of memory leaks:

```swift
// WRONG: Retain cycle - closure captures self strongly
viewModel.onUpdate = {
    self.updateUI()  // self -> closure -> self (cycle)
}

// CORRECT: Weak capture breaks the cycle
viewModel.onUpdate = { [weak self] in
    self?.updateUI()
}

// CORRECT: Unowned when lifetime is guaranteed (parent-child)
parent.onChildEvent = { [unowned self] in
    self.handleEvent()
}
```

### ARC Rules
- **Always** use `[weak self]` in closures stored as properties or passed to async operations
- Use `[unowned self]` only when the captured object's lifetime is guaranteed to outlive the closure
- Delegates must be `weak`: `weak var delegate: ConversationDelegate?`
- NotificationCenter observers: always use `[weak self]` in closure-based observers
- Combine subscriptions: `[weak self]` in `sink` closures; clean up via `Set<AnyCancellable>`
- Timer closures: always `[weak self]`, invalidate in `deinit`
- Use Xcode Memory Graph Debugger to detect retain cycles
- Use Instruments Leaks tool to profile memory in complex flows

### Common Retain Cycle Traps
```swift
// TRAP: Socket.IO event handlers
socket.on("message:new") { [weak self] data, ack in
    self?.handleNewMessage(data)
}

// TRAP: Combine pipelines
cancellable = publisher
    .sink { [weak self] value in
        self?.process(value)
    }

// TRAP: DispatchQueue closures
DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
    self?.refresh()
}
```

## Error Handling

Based on [Swift.org Error Handling](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/):

```swift
// Define domain-specific errors
enum NetworkError: LocalizedError {
    case unauthorized
    case serverError(statusCode: Int)
    case decodingFailed(underlying: Error)
    case connectionLost

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Session expired. Please log in again."
        case .serverError(let code): return "Server error (\(code))"
        case .decodingFailed: return "Failed to process server response"
        case .connectionLost: return "No internet connection"
        }
    }
}

enum MessageError: LocalizedError {
    case emptyContent
    case attachmentTooLarge(maxMB: Int)
    case conversationNotFound
    case rateLimited(retryAfter: TimeInterval)
}
```

### Error Handling Rules
- Define `enum` errors conforming to `LocalizedError` per domain (Network, Message, Auth, Media)
- Use `do-try-catch` for recoverable operations; propagate with `throws` when caller should decide
- Use `try?` only when failure genuinely means "no value" (optional conversion)
- Never use `try!` unless failure is a programmer error (assertions)
- ViewModel errors: catch in ViewModel, expose user-friendly state to Views
- Log detailed errors via `os.Logger`, show user-friendly messages in UI
- Use `Result<T, Error>` for callback-based APIs that can't use async/await

```swift
// ViewModel pattern: catch, log, expose
@MainActor class ConversationViewModel: ObservableObject {
    @Published var errorMessage: String?

    func sendMessage(_ content: String) async {
        do {
            try await messageSender.send(content)
            errorMessage = nil
        } catch let error as NetworkError {
            errorMessage = error.errorDescription
            Logger.network.error("Send failed: \(error)")
        } catch {
            errorMessage = "Something went wrong"
            Logger.network.error("Unexpected: \(error)")
        }
    }
}
```

## Swift Concurrency

Based on [Swift 6 Concurrency](https://www.hackingwithswift.com/swift/6.0/concurrency) and [WWDC sessions](https://developer.apple.com/videos/):

### Actor Isolation
```swift
// ViewModels & UI Managers: @MainActor (UI thread safety)
@MainActor class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []

    func loadMessages() async {
        let fetched = await apiClient.fetchMessages()  // Runs off main actor
        messages = fetched  // Back on MainActor automatically
    }
}

// Data processing: Custom actor (background thread safety)
actor MediaProcessor {
    private var cache: [String: Data] = [:]

    func process(_ audio: Data) async -> Data {
        // Isolated - no data races possible
    }
}
```

### Sendable
```swift
// Structs with Sendable properties are automatically Sendable
struct Message: Sendable {
    let id: String
    let content: String
}

// Classes must be explicitly marked and proven safe
final class ImmutableConfig: Sendable {
    let apiURL: URL    // let = safe
    let timeout: Int   // let = safe
}

// Use @unchecked Sendable ONLY with internal synchronization
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

### Concurrency Rules
- `@MainActor` on all ViewModels, UI Managers, and anything touching `@Published`
- `async/await` throughout; never use completion handlers for new code
- `Task { }` for launching async work from synchronous contexts (button actions, onAppear)
- `Task.detached` only when you explicitly need to escape the current actor
- `TaskGroup` / `async let` for parallel independent operations
- Always handle `Task` cancellation: check `Task.isCancelled` in long loops
- Never do heavy computation on `@MainActor`: decode JSON, process images, etc. off the main thread
- Combine `Set<AnyCancellable>` for Socket.IO subscriptions cleanup

```swift
// Parallel loading
func loadConversationData() async {
    async let messages = apiClient.fetchMessages(conversationId)
    async let members = apiClient.fetchMembers(conversationId)
    async let media = apiClient.fetchMedia(conversationId)

    let (msgs, mems, med) = await (messages, members, media)
    self.messages = msgs
    self.members = mems
    self.mediaItems = med
}
```

## SwiftUI Performance

Based on [WWDC23: Demystify SwiftUI Performance](https://developer.apple.com/videos/play/wwdc2023/10160/) and [Apple Developer Docs](https://developer.apple.com/documentation/Xcode/understanding-and-improving-swiftui-performance):

### View Body Optimization
```swift
// WRONG: Complex logic in body
var body: some View {
    VStack {
        ForEach(messages.filter { $0.isVisible }.sorted(by: { $0.date > $1.date })) { msg in
            MessageRow(message: msg)
        }
    }
}

// CORRECT: Pre-compute in ViewModel or computed property
var visibleMessages: [Message] {
    messages.filter(\.isVisible).sorted(by: { $0.date > $1.date })
}

var body: some View {
    VStack {
        ForEach(visibleMessages) { msg in
            MessageRow(message: msg)
        }
    }
}
```

### Performance Rules
- Keep `body` pure and fast: no side effects, no heavy computation
- Extract static sub-views into separate structs (SwiftUI skips re-evaluation if inputs unchanged)
- Use `let` for properties that never change (SwiftUI won't track them as dependencies)
- Use `EquatableView` or `.equatable()` on expensive sub-views
- Use `LazyVStack` / `LazyHStack` for long scrollable lists (loads on demand)
- Avoid `AnyView`: it defeats SwiftUI's structural identity optimization
- Use `@ViewBuilder` instead of `AnyView` for conditional views
- Profile with SwiftUI Instruments to identify slow body evaluations
- Minimize `@Published` property count: each change triggers full view graph re-evaluation
- Use `id()` carefully: changing identity destroys and recreates the view (expensive)

### Image & Media Performance
```swift
// CORRECT: Async image loading with placeholder
AsyncImage(url: avatarURL) { image in
    image.resizable().scaledToFill()
} placeholder: {
    Circle().fill(Color.gray.opacity(0.3))
}
.frame(width: 40, height: 40)
.clipShape(Circle())

// For lists: use CachedAsyncImage (custom, SwiftUI + DiskCacheStore 3-tier)
CachedAsyncImage(url: thumbUrl) {
    ShimmerPlaceholder()
}
.frame(width: 80, height: 80)
.clipShape(RoundedRectangle(cornerRadius: 12))

// For programmatic preload: CacheCoordinator.shared.images.image(for: url)
// (3-tier: NSCache memory → FileManager disk → URLSession network)
```

## Accessibility

Based on [Apple Accessibility Documentation](https://developer.apple.com/documentation/swiftui/view-accessibility):

```swift
// Every interactive element needs a label
Button(action: sendMessage) {
    Image(systemName: "paperplane.fill")
}
.accessibilityLabel("Send message")
.accessibilityHint("Sends the current message to the conversation")

// Group related content
VStack {
    Text(sender.name)
    Text(message.content)
    Text(message.timestamp.formatted())
}
.accessibilityElement(children: .combine)

// Dynamic Type support
Text("Hello")
    .font(.body)  // Scales automatically with Dynamic Type
    // NEVER use fixed font sizes for body text

// Hide decorative elements
Image("decorative-divider")
    .accessibilityHidden(true)
```

### Accessibility Rules
- Every `Button`, `Image`, and custom interactive element MUST have `.accessibilityLabel()`
- Use `.accessibilityHint()` for actions whose result isn't obvious from the label
- Use `.accessibilityElement(children: .combine)` to group related content for VoiceOver
- Hide decorative images with `.accessibilityHidden(true)`
- Use semantic fonts (`.body`, `.headline`, `.caption`) not fixed sizes for Dynamic Type
- Test with VoiceOver enabled (Simulator: Cmd+F5)
- Test with largest Dynamic Type size (Settings > Accessibility > Larger Text)
- Use `.accessibilityValue()` for stateful controls (sliders, toggles, progress)
- Use `.accessibilityAction()` for custom swipe actions in VoiceOver
- Use Xcode Accessibility Inspector to audit screens
- Minimum touch target: 44x44pt (Apple HIG requirement)

## Security

Based on [Apple Keychain Documentation](https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web) and iOS security best practices:

### Sensitive Data Storage
```swift
// CORRECT: Store tokens in Keychain (AES-256-GCM encrypted)
import Security

func saveToken(_ token: String, for key: String) throws {
    let data = Data(token.utf8)
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
}

// WRONG: Never store tokens in UserDefaults (unencrypted plist)
// UserDefaults.standard.set(token, forKey: "authToken")  // NEVER
```

### Security Rules
- **JWT tokens**: Store in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- **UserDefaults**: Only for non-sensitive preferences (theme, locale, onboarding flags)
- **SSL Pinning**: Implement for API connections to prevent MITM attacks
- **App Transport Security**: Keep ATS enabled; never disable globally
- **Biometric Auth**: Use `LAContext` for Face ID/Touch ID gated operations
- **Data Protection**: Use `FileProtectionType.complete` for sensitive files on disk
- **Clipboard**: Clear sensitive data from clipboard after paste timeout
- **Logging**: Never log tokens, passwords, or PII even in debug builds
- **Screenshots**: Use `UIApplication.shared.isProtectedDataAvailable` to hide sensitive content in app switcher

## Testing

Based on [XCTest Best Practices](https://developer.apple.com/documentation/xctest):

### Test Structure
```swift
// Arrange-Act-Assert pattern
func test_sendMessage_withValidContent_addsToMessages() async {
    // Arrange
    let mockSender = MockMessageSender()
    let viewModel = ConversationViewModel(messageSender: mockSender)

    // Act
    await viewModel.sendMessage("Hello")

    // Assert
    XCTAssertEqual(viewModel.messages.count, 1)
    XCTAssertEqual(viewModel.messages.first?.content, "Hello")
    XCTAssertNil(viewModel.errorMessage)
}

// Test error paths
func test_sendMessage_whenNetworkFails_setsErrorMessage() async {
    let mockSender = MockMessageSender(shouldFail: true)
    let viewModel = ConversationViewModel(messageSender: mockSender)

    await viewModel.sendMessage("Hello")

    XCTAssertNotNil(viewModel.errorMessage)
    XCTAssertTrue(viewModel.messages.isEmpty)
}
```

### Dependency Injection for Testability
```swift
// Protocol-based injection enables mocking
protocol MessageSending {
    func send(_ content: String) async throws
}

// Production implementation
class MessageSocketManager: MessageSending { ... }

// Test mock
class MockMessageSender: MessageSending {
    var sentMessages: [String] = []
    var shouldFail = false

    func send(_ content: String) async throws {
        if shouldFail { throw NetworkError.connectionLost }
        sentMessages.append(content)
    }
}

// ViewModel accepts protocol, not concrete type
class ConversationViewModel: ObservableObject {
    private let sender: MessageSending
    init(sender: MessageSending = MessageSocketManager.shared) {
        self.sender = sender
    }
}
```

### Testing Rules
- Test **behavior**, not implementation details
- Use Arrange-Act-Assert (Given-When-Then) structure
- One assertion focus per test (multiple XCTAssert is fine if testing one behavior)
- Test names: `test_{method}_{condition}_{expectedResult}`
- Use `XCTestExpectation` for async operations, never `sleep()`/`Thread.sleep()`
- Mock external dependencies (network, database, filesystem) via protocols
- Test error paths and edge cases, not just happy paths
- Use factory functions for test data, not shared mutable state
- Run tests in random order to catch hidden dependencies
- Profile test performance: slow tests erode developer velocity

## Logging

Use Apple's unified logging system (`os.Logger`), not `print()`:

```swift
import os

extension Logger {
    static let network = Logger(subsystem: "me.meeshy.app", category: "network")
    static let auth = Logger(subsystem: "me.meeshy.app", category: "auth")
    static let messages = Logger(subsystem: "me.meeshy.app", category: "messages")
    static let media = Logger(subsystem: "me.meeshy.app", category: "media")
    static let socket = Logger(subsystem: "me.meeshy.app", category: "socket")
}

// Usage
Logger.network.info("Fetching messages for \(conversationId)")
Logger.auth.error("Token refresh failed: \(error.localizedDescription)")
Logger.messages.debug("Received \(count) new messages")
```

### Logging Rules
- Use `os.Logger` (system-level, filterable, performance-optimized) not `print()`
- Categories per domain: `network`, `auth`, `messages`, `media`, `socket`
- Levels: `.debug` (development), `.info` (notable events), `.error` (failures), `.fault` (critical)
- Sensitive data is automatically redacted in non-debug builds by `os.Logger`
- Never log full tokens, passwords, or message content in production
- Use string interpolation: `Logger` defers formatting to read-time (zero cost if log level filtered)

## App Lifecycle

```swift
@main
struct MeeshyApp: App {
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                // Resume connections, refresh data
                PresenceManager.shared.goOnline()
            case .inactive:
                // Prepare for background
                PresenceManager.shared.goAway()
            case .background:
                // Save state, disconnect non-essential sockets
                PresenceManager.shared.goOffline()
            @unknown default:
                break
            }
        }
    }
}
```

### Lifecycle Rules
- Use `scenePhase` to manage connection lifecycle (connect/disconnect)
- Save critical state on `.background` transition
- Refresh stale data on `.active` transition
- Cancel non-essential network requests on `.inactive`
- Use `BGTaskScheduler` for background refresh (messages sync, push token refresh)

## Performance Profiling

### Tools
| Tool | Purpose |
|------|---------|
| SwiftUI Instruments | View body evaluations, dependency tracking |
| Allocations | Memory usage, peak memory, growth over time |
| Leaks | Retain cycles, leaked objects |
| Memory Graph Debugger | Visual object graph, find strong reference cycles |
| Time Profiler | CPU hotspots, slow functions |
| Network | Request timing, payload sizes |
| Core Animation | FPS drops, offscreen rendering |
| Energy Log | Battery impact, wake events |

### Performance Targets
- App launch to interactive: < 1 second
- View transitions: 60 FPS (16ms per frame)
- Message list scroll: zero dropped frames
- Memory: < 150MB typical usage
- Network: < 5 seconds for initial conversation load

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (MVVM, ZStack navigation, singletons, networking, property wrappers, mdia, design system, concurrence, tokens, build script, dpendances) avec contexte, alternatives rejetes et consquences.

## API Data Models
Le mapping complet entre les reponses JSON du gateway et les modeles Swift (API layer -> domain layer) est documente dans `api-data-models.md` dans ce repertoire. Ce fichier couvre:
- Tous les champs retournes par `GET /conversations` et `GET /conversations/:id/messages`
- Les structs `Decodable` du SDK (`APIConversation`, `APIMessage`, etc.)
- La logique de conversion vers les types domain (`MeeshyConversation`, `MeeshyMessage`, etc.)
- Les notes sur les cas particuliers (pinnedAt string, latitude/longitude non implemente, enrichment gateway)

## MeeshySDK
Le SDK Swift est dans `packages/MeeshySDK/` avec son propre `CLAUDE.md` et `decisions.md`. Voir ces fichiers pour l'architecture dual-target (MeeshySDK core + MeeshyUI), les conventions et les dcisions architecturales du SDK.

### REGLE CRITIQUE : Models et elements SDK
**Toute modification de models, types, structs, enums ou elements lies au SDK DOIT se faire dans `packages/MeeshySDK/`**, jamais directement dans `apps/ios/`. L'app iOS consomme le SDK comme dependance — elle ne doit pas redefinir ou dupliquer les types du SDK.

- Models API (`APIConversation`, `APIMessage`, `APIReaction`, etc.) → `packages/MeeshySDK/Sources/MeeshySDK/Models/`
- Models domain (`MeeshyConversation`, `MeeshyMessage`, etc.) → `packages/MeeshySDK/Sources/MeeshySDK/Models/`
- Extensions de conversion (`.toConversation()`, `.toMessage()`) → `packages/MeeshySDK/Sources/MeeshySDK/Models/`
- Networking (`APIClient`, `APIResponse`, etc.) → `packages/MeeshySDK/Sources/MeeshySDK/Networking/`
- Composants UI reutilisables → `packages/MeeshySDK/Sources/MeeshyUI/`

L'app iOS (`apps/ios/`) ne contient que :
- Les ViewModels specifiques a l'app
- Les Views/ecrans de l'app
- Les models purement locaux a l'app (ex: `SearchResultItem`, etats UI)
- La navigation, le theming, et la configuration app
- **L'orchestration UX produit** : View wrappers qui cascadent cache → downloader → policy, Views qui encodent des décisions Meeshy ("quand auto-DL", "comment cascader fallbacks"). Exemples : `VideoAvailabilityResolver`, `AttachmentDownloader`, `VideoMediaView`. Ces composants APPELLENT les services SDK mais ENCODENT des règles produit — donc app, pas SDK.

### Corollaire : ne PAS mettre dans le SDK
Avant de migrer un composant vers le SDK, appliquer le **test du grain** (cf. `packages/MeeshySDK/CLAUDE.md` § REGLE CRITIQUE — SDK Purity) :
- Composant atomique aux paramètres opaques → SDK
- Composant qui orchestre + décide → APP

Précédent : 2026-05-24 j'ai migré `AttachmentDownloader` au SDK sous prétexte de réutilisabilité. Rollback (commit `83e55297c`) — c'est de l'orchestration UX produit, pas un atome. "Réutilisable" n'est PAS un critère suffisant ; l'**atomicité** l'est.

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : 60/120 fps au scroll et aux transitions (Instruments, appareil réel — jamais le simulateur seul), écran servi depuis le cache au démarrage à froid, mémoire sans rétention après `pop` (Memory Graph), VoiceOver + Dynamic Type + RTL, iOS 16→26 + iPad, les 7 langues du catalogue.
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
