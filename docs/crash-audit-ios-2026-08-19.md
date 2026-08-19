# Audit crash iOS/iPadOS — 2026-08-19

**Source des faits** : 34 rapports `.ips` extraits du device connecté
« Services CEO i16pm » (iPhone 16 Pro Max, `iPhone17,2`, **iOS 26.6**) via
`idevicecrashreport`, couvrant **2026-07-24 → 2026-08-19**, builds 1255 → 1756.
Le binaire installé au moment de l'extraction était **1.0.5 (1756)** — celui-là
même qui produit les crashs les plus récents.

> Les `.ips` bruts ne sont pas versionnés. Reproduire l'extraction :
> `idevicecrashreport -e -k <dossier>` device déverrouillé et appairé.

---

## 1. Taxonomie observée

| # | Famille | Occ. | Signature | État |
|---|---------|-----:|-----------|------|
| **A** | Débordement de pile au décodage de métadonnées | **18** | `EXC_BAD_ACCESS` / `KERN_PROTECTION_FAILURE` **dans la Stack Guard** | **CORRIGÉ** |
| **B** | Récursion self-sizing `UICollectionView` | 4 | `EXC_BREAKPOINT`, `_updateVisibleCellsNow` ×6 → `_assertionFailure` | Corrigé en amont (`86e5f81f3`) — à re-vérifier |
| **C** | `SIGKILL 0xDEAD10CC` (verrou détenu à la suspension) | 5 | `RUNNINGBOARD 3735883980` | **CORRIGÉ** |
| **D** | `MPMediaItemArtwork` invoqué hors main | 2 | `EXC_BREAKPOINT` sur `*/accessQueue` | Corrigé en amont (`b92e3ffcf`) |
| **E** | Le collecteur de stack crashe lui-même | 1 | `CrashStackDumper.install` | `#if DEBUG` — dev seulement |
| **F** | `CODESIGNING` / page invalide | 1 | deux graphes SwiftUI simultanés au warm-up | Corrigé en amont (démontage synchrone) |

---

## 2. Famille A — la cause racine (18 crashs sur 34)

### 2.1 La preuve matérielle

`Meeshy-2026-08-19-061603.ips`, région mémoire de l'adresse fautive :

```
0x16ef7fe90 is in 0x16ef7c000-0x16ef80000
--->  Stack Guard   16ef7c000-16ef80000 [  16K] ---/rwx
      Stack         16ef80000-16f07c000 [1008K] rw-/rwx
      sp = 0x16ef7fe50        ← le pointeur de pile a franchi le plancher
```

Ce n'est pas un pointeur corrompu : c'est un **débordement de pile**
caractérisé. La page de garde est en `---` (aucun accès) et `sp` est *dedans*.

### 2.2 Le mécanisme

La trame fautive est, dans **les 18 cas**, le décodeur de métadonnées
**récursif** du runtime Swift :

```
swift_getTypeByMangledName
  → TypeDecoder::decodeMangledType  ⇄  decodeGenericArgs      (récursion)
    → _checkGenericRequirements → checkInvertibleRequirements
      → swift_getTypeByMangledName                            (ré-entrée !)
```

atteint depuis ~90 trames d'AttributeGraph SwiftUI. Chaque niveau
d'imbrication du type concret coûte ~17 Ko de pile (gros tampons `SmallVector`
en ligne). `ConversationView.body` imbriquait **87 niveaux** : hors budget.

Le caractère **intermittent** et le **déplacement du crash** d'un maillon à
l'autre s'expliquent par le cache de métadonnées, **global au process** : seule
la portion encore froide au moment du rendu est décodée.

### 2.3 Pourquoi le simulateur ne l'a jamais reproduit

Pile du main thread : **1008 Ko sur device**, **8 Mo sur simulateur** (hérité
de macOS). Le même code y dispose de 8× la marge. Tout gate simulateur était
structurellement aveugle à cette classe de bugs.

### 2.4 Pourquoi la campagne `AnyView` précédente ne suffisait pas

Six `AnyView` avaient été posés entre le 2026-07-30 et le 2026-08-17
(`floatingHeaderSection`, `expandedHeaderBand`, `expandedHeaderMidContent`,
`headerButtonsCluster`, `readingModeAffordanceCluster`,
`expandedHeaderSearchButton`) — le crash s'est déplacé de maillon en maillon
sans jamais disparaître.

La raison : ces érasures coupaient des **feuilles**, alors que le coût réel
était concentré (a) dans une **chaîne linéaire de 40 modificateurs** empilés
au-dessus du contenu, et (b) dans les **couches intermédiaires** restées
`some View`. Une seule matérialisation devait donc encore résoudre 87 niveaux.

### 2.5 L'expérience naturelle qui a désigné le remède

Sur les 34 `.ips`, les seuls `body` de structs **nominales** présents dans une
pile fautive sont les **trois racines** d'évaluation (`ConversationView`,
`BubbleStandardLayout`, `ConversationListView`). **Aucune struct nominale
enfant** (`ConversationHeaderAvatarView`, `HeaderCallButtonsView`,
`ReadingModeChip`, `BubbleGridCell`…) n'apparaît jamais imbriquée sous elles —
alors que **chaque propriété calculée** de la chaîne y figure.

C'est la signature d'un fait d'architecture SwiftUI : **une frontière de vue
nominale (ou de `ViewModifier`) crée un nœud d'attribut, donc un point de
ré-entrée où le graphe déroule la pile.** Une propriété calculée, non.

### 2.6 Le contributeur systémique : la couche `Compatibility/`

`adaptiveOnChange` (**233 sites d'appel**) et `adaptiveGlass` (**87 sites**)
étaient des `@ViewBuilder` portant un `if #available`. Le type produit est
`_ConditionalContent<BrancheA, BrancheB>` — qui **embarque les deux branches** :
le type de l'appelant **doublait** à chaque appel, pour **2 niveaux**
d'imbrication au lieu de 1.

Douze `.adaptiveOnChange` empilés sur le seul `ConversationView.body`
pesaient **22 des 87 niveaux**, et expliquaient une bonne part des 13 496
caractères du nom de type.

---

## 3. Correctifs appliqués

| Correctif | Portée | Effet mesuré |
|---|---|---|
| `adaptiveOnChange` → `ViewModifier` | SDK, **233 sites** | ConversationView 87 → 76 |
| `adaptiveGlass` ×3 → `ViewModifier` | SDK, **87 sites** | ConversationListView 64 → 56 |
| 4 couches de `ConversationView` érasées à la déclaration | app | `body` → dans le budget |
| `themedComposer`, `quickReactionBarOverlay` érasés | app | supprime le chemin le plus profond de `bodyContent` |
| `mainContent`, `mainContentZStack` érasés | app | ConversationListView → dans le budget |
| `contentStack`, `bubbleInnerContent`, `visualMediaGrid`, `mediaWithReplyContainer` érasés | app | BubbleStandardLayout 48 → dans le budget |
| `writingToSharedContainer` (assertion de tâche d'arrière-plan) | app | ferme la famille C |

**Les deux correctifs SDK sont les plus rentables du lot** : ils sont neutres
en comportement, tiennent en deux fichiers, et allègent **320 sites d'appel**
dans toute l'application — y compris des écrans qui n'avaient pas encore
crashé (`StoryViewerView` : 16 `adaptiveOnChange`, `UniversalComposerBar` : 11).

### Gardes de non-régression

- `ConversationViewBodyTypeDepthTests` — mesure la **profondeur d'imbrication
  réelle du type** de chaque `body` racine sur un thread à pile de 64 Mo, et la
  borne à 40 niveaux. Instrument direct de la grandeur qui cause le crash, et
  **il fonctionne au simulateur** là où le crash lui-même ne s'y reproduit pas.
- `ConversationViewLayerErasureSourceGuardTests` — fige les 12 maillons érasés
  et les 2 shims `Compatibility/`. Nécessaire car une fois un maillon érasé,
  la garde runtime ne le voit plus (angle mort assumé et documenté).
- `WidgetDataManagerSharedContainerWriteGuardTests` — interdit toute écriture
  App Group hors assertion de tâche d'arrière-plan.

---

## 4. Famille C — `0xDEAD10CC`

`0xDEAD10CC` signifie littéralement : *« le process détenait un verrou de
fichier/base au moment de sa suspension »*. Pile de `Meeshy-2026-08-17-074340` :

```
ConversationListViewModel.syncBadgeOnUnreadChange   (sink Combine, .debounce 200 ms)
  → NotificationCoordinator.registerConversations
    → WidgetDataManager.publishConversations
      → -[NSUserDefaults setObject:forKey:]
        → CFPrefsPlistSource … xpc_connection_send_message_with_reply_sync
          → mach_msg2_trap                        ← BLOQUÉ pendant la suspension
```

Une écriture `UserDefaults` sur une suite **App Group** n'est pas une écriture
mémoire : c'est un **aller-retour XPC synchrone vers `cfprefsd`**. Le
`.debounce(200 ms)` en amont est précisément ce qui rend l'accident probable —
il replante l'écriture jusqu'à 200 ms *après* la dernière mutation, donc
potentiellement dans la fenêtre de suspension ouverte par un passage en
arrière-plan.

**Correctif** : les 5 sites d'écriture passent par `writingToSharedContainer`,
qui prend une assertion `beginBackgroundTask` rendue en `defer` — remède
canonique d'Apple. Même parapluie que `BackgroundTransitionCoordinator`.

---

## 5. Risques identifiés — À TRAITER (non corrigés ici)

Classés par gravité. Aucun n'est corrigé dans ce lot : ils sont **signalés**,
conformément à la demande.

### R1 — `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` : classe entière de SIGTRAP

`apps/ios/project.yml:28` et `Package.swift:27` (SE-0466) rendent **tout
closure littéral implicitement `@MainActor`**. Quand un framework Objective-C
dont le paramètre bloc n'est **pas** `@Sendable` l'invoque hors main, Swift
insère un contrôle d'executor (`swift_task_isCurrentExecutorImpl`) qui
**trappe fatalement**. Le compilateur ne voit rien.

C'est exactement la famille D (`MPMediaItemArtwork`, 2 crashs, corrigée par un
`nonisolated enum` dédié). **Un site suspect subsiste** :

- `EdgeTranscriptionService.swift:36` — `SFSpeechRecognizer.requestAuthorization { … }`
  rappelle sur une file arbitraire.

Vérifiés **sains** : les 8 `addPeriodicTimeObserver` passent tous `queue: .main`.

**Action proposée** : audit exhaustif des closures littérales passées à des API
ObjC à rappel non garanti sur main, et règle d'équipe — *tout closure remis à
un framework se construit dans un contexte `nonisolated`*.

### R2 — La dette de profondeur de type n'est pas purgée, seulement bornée

L'érasure `AnyView` **borne chaque matérialisation à sa couche** mais ne
supprime pas la cause : des `body` monolithiques. `ConversationView.swift`
fait **2560 lignes**, son ViewModel **4853**. Les vraies structures nominales
(`ViewModifier` pour les couches sheets/covers/lifecycle, vues enfants pour le
header et le composeur) restent le remède de fond — plus performant que
l'érasure, qui coûte une boîte existentielle par couche.

Non fait ici : ~600 lignes de câblage délicat (`@FocusState` ne se passe pas en
`Binding` simple) sur l'écran le plus complexe de l'app, **non validable par
les tests unitaires disponibles**. À planifier comme chantier dédié, écran par
écran, avec la garde de profondeur comme filet.

**Autres vues à mesurer** (jamais crashées, mais volumineuses) :
`StoryViewerView+Content` (3239 l.), `FeedCommentsSheet` (2512 l.),
`PostDetailView` (2474 l.), `RootView` (2470 l.), `CallView` (2210 l.).
Étendre `ConversationViewBodyTypeDepthTests` à ces racines est peu coûteux.

### R3 — Le reste de la couche `Compatibility/` porte encore l'anti-patron

Corrigés : `AdaptiveOnChange`, `AdaptiveGlass`. **Restent en `@ViewBuilder` +
`if #available`** : `AdaptiveSymbolEffects` (3), `AdaptiveMap` (3),
`AdaptivePagingScroll` (3), `AdaptiveSheetSizing` (1), `AdaptiveVerticalPager` (1),
plus `DeviceLayout`, `LentillePerspective`, `ScrollOffsetTracking`.
Leur nombre de sites d'appel est aujourd'hui faible, mais chacun **double le
type de son appelant**. Conversion mécanique, même patron.

### R4 — Le collecteur de crash est lui-même dangereux

`Meeshy-2026-08-10-211647` : `CrashStackDumper.install()` crashe dans son
propre handler (`Array.withUnsafeBufferPointer` sur un thread NSURLSession).
Un handler de signal ne doit exécuter que des opérations *async-signal-safe* —
ni allocation, ni runtime Swift. `#if DEBUG` donc hors App Store, mais il
**masque les crashs qu'il est censé capturer**.

### R5 — `ConversationFirstRenderWarmup` est un échafaudage à retirer

157 lignes `#if DEBUG` qui montent une `UIWindow` cachée pour préchauffer le
cache de métadonnées. Il a déjà causé un crash à lui seul (famille F : deux
graphes SwiftUI actifs). Sa raison d'être disparaît avec le correctif A —
**à supprimer après validation**, sinon il redeviendra une source de crashs
propres.

### R6 — Famille B à re-vérifier

L'entonnoir `invalidateLayout(with:)` (`MessageListLayout.swift`) a atterri le
2026-08-18 à 12:29 (`86e5f81f3`). Le dernier SIGTRAP de cette famille date du
même jour à 17:58, sur un binaire build 1756 dont l'horodatage de compilation
n'est pas établi. Les deux crashs postérieurs (18/08 23:42, 19/08 06:16) sont
de la famille A. **Probablement clos** — à confirmer par une campagne de fling.

### R7 — Points mineurs relevés

- `AppDatabase.swift:137` — `try! DatabaseQueue()` : le repli de dernier
  recours peut lui-même trapper. Probabilité quasi nulle, mais c'est le
  chemin de secours.
- Les `try! NSRegularExpression` (9) portent des motifs littéraux constants et
  les `as! AVPlayerLayer` (3) sont gardés par `layerClass` : **sans risque**,
  documentés ici pour clore la question.
- `syncBadgeOnUnreadChange` débounce alors que son commentaire affirme que
  « le coordinateur débounce en aval » : **double débounce**, à trancher.

---

## 6. Vérification sur device — faite

La garde de profondeur tourne au simulateur et prouve l'invariant de type ;
elle ne prouve pas l'absence de crash sur device, puisque le simulateur ne peut
pas reproduire la classe A (§2.3). Campagne réelle menée le 2026-08-19 :

| | Ancien binaire (`Meeshy.debug.dylib` `c59c3955…`) | Après correctif (`82C1C1A6…`) |
|---|---|---|
| Crashs | **2 en 3 minutes** (08:35:42, 08:38:06) | **0** |
| Lancements | — | **31 consécutifs** |

**Pourquoi ces lancements sont le bon test.** La pile des deux crashs de 08:35
et 08:38 — ancien binaire, dix minutes avant que le correctif n'atterrisse —
est exactement :

```
MeeshyApp.$main()
  → ConversationFirstRenderWarmup.run() → performWarmup()
    → ConversationView.body → bodyWithSheets → bodyWithCovers
      → bodyWithLifecycle → bodyContent → floatingHeaderSection
        → floatingHeaderSectionBody
          → __swift_instantiateConcreteTypeFromMangledNameV2   ← mort
```

Le warm-up `#if DEBUG` monte une `UIWindow` cachée et force un rendu COMPLET de
`ConversationView` **à chaque lancement**. Chaque lancement exerce donc
intégralement le chemin fautif, sans interaction utilisateur.

**Piège de méthode à retenir** : `CFBundleVersion` est figé en dur à `1756`
dans `Meeshy/Info.plist` (indépendant de `CURRENT_PROJECT_VERSION`, cf.
`agvtool`), donc le numéro de build **ne discrimine pas** l'ancien binaire du
neuf. Le discriminant fiable est l'**UUID de `Meeshy.debug.dylib`** — tout le
code y vit ; l'exécutable `Meeshy` n'est qu'un lanceur et garde le même UUID.

**Non couvert par cette campagne** : les chemins qui exigent une interaction
(ouvrir une conversation avec pièces jointes → `BubbleStandardLayout` sur le
thread de diffing ; barre de réaction rapide). Leur invariant de type est
prouvé par `ConversationViewBodyTypeDepthTests`, pas leur exécution device.
