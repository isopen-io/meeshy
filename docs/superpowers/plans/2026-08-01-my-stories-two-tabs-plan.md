# « Mes stories » en deux onglets — plan d'architecture

Date : 2026-08-01
Portée : `apps/ios/Meeshy/Features/Main/Views/`, `apps/ios/Meeshy/Features/Main/ViewModels/`,
`packages/MeeshySDK/Sources/MeeshySDK/Models/`
Prolonge : `docs/superpowers/specs/2026-08-01-story-drafts-multi-and-recovery-design.md`

---

## 0. Ce que le code dit, et où il contredit la demande

Trois constats de lecture qui déplacent le centre de gravité du lot. Ils sont
détaillés en § 7, mais ils conditionnent tout le reste.

**(a) La carte « périmée » est presque invisible aujourd'hui.**
`PostFeedService.getStories` filtre `expiresAt: { gt: now }` sans exception d'auteur
(`services/gateway/src/services/PostFeedService.ts:266`). Le serveur ne renvoie donc
JAMAIS mes stories périmées. Côté client, la purge locale les protège explicitement
(`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTrayPurge.swift:87` — « Mes propres
stories expirées restent »), mais le chemin de refetch complet fait
`storyGroups = groups` (`apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:417`),
donc un pull-to-refresh les efface. **La demande « story périmée avec voile gris »
exige une réinjection locale** — sinon la fonctionnalité n'est visible qu'entre deux
refetchs complets. C'est un incrément à part entière (inc. 3).

**(b) L'onglet Brouillons ne compile pas aujourd'hui.**
`StoryDraftStore` est déjà partitionné (`save(draftId:…)` l.258, `load(draftId:)` l.538,
`listDrafts()` l.649), mais le composer appelle encore les anciennes signatures :
`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift:200, 271,
303, 313, 338, 364, 371, 399`. L'onglet Brouillons dépend donc de l'**incrément 3 du
spec** (identité de brouillon dans le composer), pas seulement de l'incrément 2.

**(c) `MyStoryRow` ne peut structurellement pas être `Equatable`.**
Elle est générique sur `MenuContent: View` (`MyStoriesView.swift:635`) et porte quatre
propriétés closures (`menuContent`, `onTap`, `onOpenComments`, `onOpenViewers`, l.642-645).
SwiftUI ne peut comparer aucune d'elles : la ligne se ré-évalue intégralement à chaque tick
du parent. C'est l'argument décisif du § 2.

---

## 1. Décomposition en composants

### 1.1 Ce qui sort de `MyStoriesView.swift` (1085 lignes → ~260)

| Actuel (lignes) | Destination | Nouveau nom |
|---|---|---|
| `MyStoriesView` 19-541 | reste sur place | `MyStoriesView` (coquille : onglets, sheets, actions serveur) |
| `MyStoryRowAccessibility` 550-565 | `MyStories/MyStoryCardAccessibility.swift` | `MyStoryCardAccessibility` |
| `MyStoriesCommentsResolver` 575-579 | `MyStories/MyStoriesCommentsResolver.swift` | inchangé |
| `StoryVisibilityMenuResolver` 589-631 | `MyStories/StoryVisibilityMenuResolver.swift` | inchangé (déplacement pur) |
| `MyStoryRow` 635-948 | **éclaté** en 3 (voir § 2) | `MyStoryCard` + `MyStoryActionBar` + `MyStoryThumbnail` |
| `ActiveUploadRow` 957-1011 | `MyStories/ActiveUploadBanner.swift` | `ActiveUploadBanner` |
| `FailedStoryRow` 1020-1068 | `MyStories/FailedStoryRow.swift` | inchangé (+ 2 correctifs, § 7.6 et 7.8) |
| `AudienceTarget` 1073-1077 | `MyStories/MyStoriesTargets.swift` | inchangé |
| `MyStoriesCommentTarget` 1082-1085 | `MyStories/MyStoriesTargets.swift` | inchangé |
| `actionMenu(for:)` 335-393 | `MyStories/MyStoryMenuBuilder.swift` | `MyStoryMenuBuilder` (rend un `[MyStoryMenuAction]`) |

Le dossier est `apps/ios/Meeshy/Features/Main/Views/MyStories/`. XcodeGen globe
récursivement `sources: - path: Meeshy` (`apps/ios/project.yml`) : aucun fichier
`.pbxproj` à toucher.

`MyStoriesView.swift` **garde son chemin actuel** : cinq fichiers de tests lisent ce
chemin en dur (§ 7.10). Déplacer la coquille rendrait rouges des tests sur du code
correct, sans rien gagner.

### 1.2 Fichiers à CRÉER

**App — `apps/ios/Meeshy/Features/Main/Views/MyStories/`**

| Fichier | Types | Rôle |
|---|---|---|
| `MyStoriesTab.swift` | `enum MyStoriesTab`, `enum MyStoriesTabResolver` | identité des onglets + onglet initial (pur) |
| `MyStoryCardModel.swift` | `struct MyStoryCardModel`, `enum MyStoryCardModelBuilder` | value model `Equatable` de la carte + constructeurs purs depuis `StoryItem` et `StoryDraftSummary` |
| `MyStoryCard.swift` | `struct MyStoryCard: View, Equatable` | la carte (vignette + voile + date + bande) |
| `MyStoryThumbnail.swift` | `struct MyStoryThumbnail: View, Equatable` | cascade ThumbHash → URL → placeholder + overlay texte (extrait de 881-938) |
| `MyStoryActionBar.swift` | `struct MyStoryActionBar: View, Equatable`, `enum MyStoryGlyph` | bande basse de glyphes |
| `MyStoryActionSetResolver.swift` | `enum MyStoryActionSetResolver`, `enum MyStoryMenuAction`, `enum MyStoryCardContext` | quels glyphes / quelles entrées de menu, par contexte (pur) |
| `MyStoryLifecycleResolver.swift` | `enum MyStoryLifecycle`, `enum MyStoryLifecycleResolver` | active vs périmée (pur, délègue à `StoryItem.isExpired`) |
| `StoryPublicationDateResolver.swift` | `enum StoryDateFormat`, `enum StoryPublicationDateResolver` | relatif < 1 mois, absolu au-delà (pur) |
| `MyStoryMenuBuilder.swift` | `struct MyStoryMenuBuilder` | `@ViewBuilder` qui rend un `[MyStoryMenuAction]` en `Button`/`Menu` |
| `MyStoriesPublishedTab.swift` | `struct MyStoriesPublishedTab: View` | bandeau upload + grille des cartes publiées |
| `MyStoriesDraftsTab.swift` | `struct MyStoriesDraftsTab: View` | section « Échecs de publication » + grille des brouillons |
| `ActiveUploadBanner.swift` | `struct ActiveUploadBanner: View` | déplacement de 957-1011 |
| `FailedStoryRow.swift` | `struct FailedStoryRow: View` | déplacement de 1020-1068 |
| `MyStoriesTargets.swift` | `AudienceTarget`, `MyStoriesCommentTarget`, `MyStoriesDraftTarget` | cibles de sheets |
| `MyStoryCardAccessibility.swift` | `enum MyStoryCardAccessibility` | déplacement de 550-565, élargi aux brouillons |

**App — `apps/ios/Meeshy/Features/Main/ViewModels/`**

| Fichier | Types |
|---|---|
| `StoryDraftsViewModel.swift` | `protocol StoryDraftListing`, `final class StoryDraftsViewModel: ObservableObject` |

Le protocole précède l'implémentation (règle iOS TDD, `apps/ios/CLAUDE.md` § iOS TDD
Requirements) et permet un `MockStoryDraftListing` sans toucher GRDB :

```swift
protocol StoryDraftListing: Sendable {
    func listDrafts() -> [StoryDraftSummary]
    func delete(draftId: String)
}
extension StoryDraftStore: StoryDraftListing {}
```

`StoryViewModel` fait déjà 2499 lignes : les brouillons n'y entrent pas.

**SDK — `packages/MeeshySDK/Sources/MeeshySDK/Models/`**

| Fichier | Type |
|---|---|
| `StoryArchiveMerge.swift` | `extension Array where Element == StoryGroup { func mergingOwnExpiredArchive(...) }` |

**Placement SDK justifié** par le test du grain de `packages/MeeshySDK/CLAUDE.md` : c'est
l'opération symétrique de `StoryTrayPurge.swift` (même fichier voisin, même modèle, même
niveau), paramètres opaques (`previousGroups`, `currentUserId`, `now`), aucune lecture de
singleton Meeshy, aucune décision « quand faire X ». Le *branchement* (« appeler ça après
le refetch complet ») reste app-side, dans `StoryViewModel`.

### 1.3 Fichiers à MODIFIER

| Fichier | Modification |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` | 1085 → ~260 l. : `Picker` d'onglets + `switch` + les sheets/alertes/actions serveur existantes |
| `apps/ios/Meeshy/Features/Main/Views/MyStoriesEmptyStateResolver.swift` | signature par onglet (§ 3.4) |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | **deux** call sites (l.120 et l.779) : nouveaux callbacks `onOpenDraft` / `onResumeFailedItem` |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | l.417 : `storyGroups = groups.mergingOwnExpiredArchive(previous:…)` |
| `apps/ios/Meeshy/Localizable.xcstrings` | ~14 clés neuves (onglets, états vides, actions brouillon, a11y) |

### 1.4 Fichiers à SUPPRIMER

**Aucun.** Le type `MyStoryRow` disparaît (remplacé), mais aucun fichier n'est supprimé.
C'est volontaire : un lot qui supprime des fichiers dans un worktree partagé multiplie les
conflits (`feedback_git_checkout_clobbers_concurrent_uncommitted_work`).

---

## 2. Le modèle de carte : une carte paramétrée, une bande séparée

### 2.1 Une carte, pas deux — et voici pourquoi, à la lecture

`MyStoryRow` (`MyStoriesView.swift:635-948`) est une **ligne horizontale**, pas une carte.
Elle porte quatre responsabilités mélangées :

1. cascade de vignette + overlay des textes composés (881-938) ;
2. métriques d'engagement (684-695) ;
3. glyphes d'action (706-771) ;
4. composition du libellé VoiceOver (774-835).

Trois observations décident la forme cible.

**Observation 1 — la bande est déjà écrite trois fois.** Le même patron
`HStack(spacing: 3) { Image; if count > 0 { Text } }` + `.foregroundColor(.secondary)`
+ `.padding(8)` + `.contentShape(Rectangle())` + `.buttonStyle(.plain)` +
`.accessibilityHidden(true)` apparaît à l.707-724 (œil), l.731-749 (bulle), et une
quatrième fois en dérivé dans `metric(icon:value:)` l.940-947 (cœur). Deux cartes
distinctes en feraient une cinquième et une sixième copie. **La bande doit être un
composant.**

**Observation 2 — la carte ne peut pas être `Equatable` dans sa forme actuelle.**
`MyStoryRow<MenuContent: View>` (l.635) porte `menuContent: () -> MenuContent` (l.642),
`onTap` (l.643), `onOpenComments` (l.644), `onOpenViewers` (l.645). SwiftUI ne compare pas
les closures : la comparaison structurelle échoue toujours, `.equatable()` est impossible,
et la ligne — vignette et `ForEach` sur `storyEffects.textObjects` inclus (l.924-937) — se
ré-évalue à chaque tick du parent. La règle « Zero Unnecessary Re-render » de
`CLAUDE.md` est donc violée par construction, pas par négligence.

**La correction est de transformer les actions en DONNÉES.** La carte reçoit un
`[MyStoryGlyph]` (valeurs `Equatable`) et **une seule** closure d'émission
`onAction: (MyStoryAction) -> Void`, ignorée par un `==` manuel :

```swift
struct MyStoryCard: View, Equatable {
    let model: MyStoryCardModel        // Equatable, primitifs uniquement
    let glyphs: [MyStoryGlyph]         // Equatable
    let onAction: (MyStoryAction) -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.model == rhs.model && lhs.glyphs == rhs.glyphs
    }
}
```

Le générique `MenuContent` disparaît, ce qui supprime aussi le seul obstacle à
`.equatable()`.

**Observation 3 — un brouillon n'est pas un `StoryItem`.** Le forcer dans ce type serait un
mensonge (pas de `viewCount`, pas d'`expiresAt`, pas d'`id` serveur). La carte prend donc un
**value model** neutre, pas un `StoryItem` :

```swift
struct MyStoryCardModel: Identifiable, Equatable {
    let id: String
    let thumbnail: MyStoryThumbnailSource   // .composite(Data) / .remoteURL(String) / .localFile(URL) / .placeholder
    let aspectRatio: Double?
    let textOverlays: [MyStoryTextOverlay]  // valeur, pas StoryEffects
    let isDimmed: Bool                      // ← le voile gris
    let dateLabel: String
    let dateAccessibilityLabel: String
    let accentHex: String
    let isSelected: Bool
    let badge: MyStoryCardBadge?            // .slideCount(Int) pour un brouillon
}
```

**Verdict : UNE carte partagée, paramétrée par un value model, + UNE bande de glyphes
séparée.** Publiée et brouillon ne diffèrent que par (a) le `MyStoryCardModel` produit par
le constructeur, (b) le `[MyStoryGlyph]` produit par le résolveur. Aucun booléen `isDraft`
ne traverse la vue : la décision est prise une fois, en amont, par une fonction pure.

### 2.2 Respect de « zéro re-render inutile »

- `MyStoryCard`, `MyStoryThumbnail`, `MyStoryActionBar` : `Equatable`, entrées primitives,
  `.equatable()` au site d'appel.
- **Aucun `@ObservedObject` sur un singleton dans la carte.** Aujourd'hui
  `MyStoriesView.swift:641` porte `@ObservedObject var saveService: StoryPhotoSaveService`
  **dans la cellule** : chaque tick de progression d'enregistrement ré-évalue TOUTES les
  lignes. L'observation remonte dans `MyStoriesView` (une fois), et la carte reçoit
  `saveProgress: Double?` + `isSaveCancellable: Bool` en primitifs.
- `accentColor` passe en **hex `String`**, pas en `Color` : stable, comparable, et lisible
  dans les tests.
- La grille est `LazyVGrid` : les cartes hors écran ne sont pas instanciées.

### 2.3 Accessibilité de la bande

Les boutons actuels font `Image(size: 15…16) + .padding(8)` ≈ **31-34 pt**
(`MyStoriesView.swift:719, 744, 766`) — sous le minimum HIG de 44×44. `MyStoryActionBar`
impose `.frame(minWidth: 44, minHeight: 44)` par glyphe. La bande reste
`.accessibilityHidden(true)` et les actions remontent en `.accessibilityActions` sur la
carte (patron existant l.793-823, à conserver tel quel : le modifier est TOUJOURS attaché,
seul le contenu du builder varie).

---

## 3. Les helpers PURS et testables

Tous les tests portent sur des **valeurs**, jamais sur des chaînes localisées : la CI
tourne en `en`, comparer à un littéral français rend vert en local et rouge en CI
(cf. `MyStoryRowSaveRingTests.swift:11-13`, même précaution).

### 3.1 Format de date : relatif < 1 mois, absolu au-delà

```swift
enum StoryDateFormat: Equatable { case relative, absolute }

enum StoryPublicationDateResolver {
    /// Décide la FORME. Le rendu est délégué (voir `label`), pour que le test
    /// n'ait jamais à comparer une chaîne localisée.
    static func format(date: Date, now: Date, calendar: Calendar = .current) -> StoryDateFormat

    /// `.relative` → `RelativeTimeFormatter.longString(for:now:calendar:)`
    /// `.absolute` → date exacte localisée (`Date.FormatStyle`, jour + mois + année)
    static func label(date: Date, now: Date, calendar: Calendar = .current) -> String
}
```

Seuil calendaire (`calendar.date(byAdding: .month, value: -1, to: now)`), **pas**
`30 * 86400` : « un mois » vaut 28 à 31 jours, un seuil fixe ferait diverger février de
janvier. Bascule inclusive : exactement un mois → `.absolute`.

`RelativeTimeFormatter.longString` **n'est pas réutilisable seule** : elle reste relative
jusqu'à 90 jours (`packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift:92`)
et son `absoluteDate` est `private` (l.169). D'où le découpage décision/rendu.

Tests (`apps/ios/MeeshyTests/Unit/Views/StoryPublicationDateResolverTests.swift`) :
- `test_format_publishedFiveMinutesAgo_returnsRelative`
- `test_format_publishedTwentyNineDaysAgo_returnsRelative`
- `test_format_publishedExactlyOneMonthAgo_returnsAbsolute`
- `test_format_publishedInTheFuture_returnsRelative` — dérive d'horloge serveur : une date
  légèrement en avance ne doit pas tomber dans la branche absolue
- `test_format_shortFebruaryCrossing_usesCalendarMonthNotThirtyDays` — 1ᵉʳ fév → 1ᵉʳ mars =
  `.absolute` (une règle à 30 jours dirait encore `.relative`)

### 3.2 Cycle de vie : active vs périmée

```swift
enum MyStoryLifecycle: Equatable { case active, expired }

enum MyStoryLifecycleResolver {
    /// DÉLÈGUE à `StoryItem.isExpired(at:)` — jamais de seconde formule.
    static func lifecycle(of story: StoryItem, now: Date) -> MyStoryLifecycle
    /// Le voile gris EST la traduction visuelle du cycle de vie, rien d'autre.
    static func isDimmed(_ lifecycle: MyStoryLifecycle) -> Bool
}
```

La règle d'expiration a une seule source : `StoryModels.swift:2075-2080` (`expiresAt <= now`,
sinon `createdAt + 21 h`). Ré-implémenter le fallback ici recréerait le piège documenté
l.2067-2072 (« l'ancien défaut interne de 24 h était un piège dormant »).

Tests (`MyStoryLifecycleResolverTests.swift`) :
- `test_lifecycle_expiresAtInFuture_returnsActive`
- `test_lifecycle_expiresAtExactlyNow_returnsExpired` — miroir du `<=` de l.2077
- `test_lifecycle_noExpiresAtCreatedTwentyHoursAgo_returnsActive`
- `test_lifecycle_noExpiresAtCreatedTwentyTwoHoursAgo_returnsExpired`
- `test_lifecycle_agreesWithStoryItemIsExpired_acrossBoundary` — anti-dérive : la sortie du
  résolveur est comparée à `story.isExpired(at:)` sur une grille de dates

### 3.3 Jeu d'actions par contexte

```swift
enum MyStoryCardContext: Equatable {
    case published(lifecycle: MyStoryLifecycle,
                   viewCount: Int, reactionCount: Int, commentCount: Int, isPublic: Bool)
    case draft(slideCount: Int)
}

enum MyStoryGlyph: Equatable {
    case viewers(count: Int)      // œil — vues + réactions
    case reactions(count: Int)    // cœur — indicateur seul
    case comments(count: Int)     // bulle — feuille de commentaires
    case publish                  // brouillon uniquement
    case more                     // « … »
    case saveProgress(Double)     // anneau, remplace `more` pendant un enregistrement
}

enum MyStoryMenuAction: Equatable {
    case open, viewers, edit, visibility, share, save, forward, repost, delete
    case publishNow, schedule
}

enum MyStoryActionSetResolver {
    static func glyphs(context: MyStoryCardContext,
                       isSelecting: Bool,
                       saveProgress: Double?) -> [MyStoryGlyph]

    static func menu(context: MyStoryCardContext,
                     capabilities: MyStoriesCapabilities) -> [MyStoryMenuAction]
}

struct MyStoriesCapabilities: Equatable {
    let scheduling: Bool   // faux tant que « Programmer » n'est pas livré (§ 5)
}
```

Règles encodées, tirées du verbatim produit et du code existant :
- une story **périmée** a **exactement la même bande** qu'une active — seul le voile change ;
- un brouillon n'a ni œil ni cœur (pas d'audience → pas de zéros décoratifs, cohérent avec la
  directive 2026-07-29 déjà appliquée l.688-693) ; il gagne `publish` et garde `more` ;
- l'anneau de progression remplace `more` (comportement actuel l.750-771, à conserver
  verbatim par demande produit) ;
- en mode sélection, la bande est vide (miroir des trois `if !isSelecting` l.706, 731, 750).

Tests (`MyStoryActionSetResolverTests.swift`) :
- `test_glyphs_publishedActive_ordersEyeThenHeartThenCommentsThenMore`
- `test_glyphs_publishedExpired_isIdenticalToPublishedActive`
- `test_glyphs_draft_containsPublishAndMore_only`
- `test_glyphs_draft_neverContainsViewersOrReactions`
- `test_glyphs_saveInFlight_replacesMoreWithSaveProgress`
- `test_glyphs_isSelecting_returnsEmpty`
- `test_menu_draft_containsEditScheduleDelete`
- `test_menu_draft_omitsViewersAndVisibility`
- `test_menu_draft_schedulingDisabled_omitsSchedule`
- `test_menu_publishedNonPublic_omitsRepost` — **à trancher avant d'écrire ce test**, voir § 7.13

### 3.4 État vide, par onglet

```swift
enum MyStoriesTab: String, Equatable, CaseIterable { case published, drafts }

enum MyStoriesEmptyStateResolver {
    static func shouldShowEmptyState(tab: MyStoriesTab,
                                     hasStories: Bool,
                                     hasActiveUpload: Bool,
                                     hasFailedItems: Bool,
                                     hasDrafts: Bool) -> Bool
}
```

L'ancienne signature à 4 arguments (`MyStoriesEmptyStateResolver.swift:9`) est
**remplacée, pas doublée** — même raison que le spec ligne 108-109 : « deux portes vers le
même store est le défaut qui a produit l'écrasement silencieux ».

Répartition : les échecs de publication migrent vers l'onglet **Brouillons** (§ 4.3), donc
`hasFailedItems` compte pour cet onglet, pas pour « Publiées ».

Tests (les 4 existants de `MyStoriesEmptyStateResolverTests.swift` sont réécrits) :
- `test_shouldShowEmptyState_publishedTab_nothingAnywhere_returnsTrue`
- `test_shouldShowEmptyState_publishedTab_draftsOnly_returnsTrue` — un brouillon ne doit PAS
  masquer l'état vide de l'onglet Publiées (le piège exact que créerait une signature à plat)
- `test_shouldShowEmptyState_publishedTab_activeUploadOnly_returnsFalse` — comportement
  actuel préservé
- `test_shouldShowEmptyState_draftsTab_draftsOnly_returnsFalse`
- `test_shouldShowEmptyState_draftsTab_failedItemsOnly_returnsFalse`
- `test_shouldShowEmptyState_draftsTab_publishedStoriesOnly_returnsTrue`

### 3.5 Onglet initial

```swift
enum MyStoriesTabResolver {
    static func initialTab(hasStories: Bool, hasDrafts: Bool, hasFailedItems: Bool) -> MyStoriesTab
}
```

Tests :
- `test_initialTab_hasStories_returnsPublished`
- `test_initialTab_noStoriesButDrafts_returnsDrafts`
- `test_initialTab_noStoriesButFailedItems_returnsDrafts` — l'utilisateur qui ouvre après un
  échec doit atterrir là où l'action se trouve
- `test_initialTab_nothingAnywhere_returnsPublished`

### 3.6 Archive locale des périmées (SDK)

```swift
public extension Array where Element == StoryGroup {
    /// Réinjecte les stories de `currentUserId` PÉRIMÉES à `now` que `self`
    /// (payload serveur) ne contient plus mais que `previous` (état local)
    /// portait encore. Ne ressuscite JAMAIS une story non périmée absente du
    /// serveur : celle-là a été supprimée, pas expirée.
    func mergingOwnExpiredArchive(previous: [StoryGroup],
                                  currentUserId: String?,
                                  now: Date = Date()) -> [StoryGroup]
}
```

Tests (`packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryArchiveMergeTests.swift`) :
- `test_merging_ownExpiredStoryAbsentFromServer_isPreserved`
- `test_merging_otherUserExpiredStory_isNotPreserved` — le tray des autres reste propre
- `test_merging_ownLiveStoryAbsentFromServer_isNotResurrected` — la suppression reste une
  suppression
- `test_merging_storyPresentInBoth_keepsServerVersion` — les compteurs serveur gagnent
- `test_merging_preservesMostRecentFirstOrdering`

---

## 4. Navigation par onglets

### 4.1 `Picker` segmenté, pas `TabView`

**Décision : `Picker(.segmented)` + `switch` sur l'onglet.**

- Le patron existe déjà dans l'app : `BookmarksView.swift:150`, `EditPostSheet.swift:269`,
  `CommunityDetailView.swift:62`.
- `MyStoriesView` est présentée en **sheet** (`StoryTrayView.swift:119` et `:778`) avec un
  `NavigationStack` interne. Un `TabView(.page)` y ajouterait un troisième geste horizontal
  en concurrence du drag de fermeture de sheet et du scroll de grille — la famille de pièges
  « gestes avalés » déjà documentée sur ce projet.
- `TabView(.page)` **instancie les deux onglets simultanément** : à l'ouverture, la grille des
  brouillons ferait ses lectures GRDB (`listDrafts()`) même si l'utilisateur ne la voit pas.
  Contraire à « cache-first, coût nul sur l'écran non regardé ».
- Le `switch @ViewBuilder` ne construit que l'onglet actif.

Coût du revirement si le produit veut le swipe : les deux onglets sont déjà des `View`
autonomes (`MyStoriesPublishedTab`, `MyStoriesDraftsTab`), le `switch` devient un
`TabView(selection:)` — un fichier, ~10 lignes.

Le `Picker` est posé sous la barre de navigation via `.safeAreaInset(edge: .top)` pour qu'il
reste visible pendant le scroll de la grille.

### 4.2 Grille ou carrousel ?

**Point à confirmer avec le produit.** Le verbatim dit « carrousselle de story par ordre de
publication ». Deux lectures :

- **carrousel horizontal** (comme `StoryTrayView`) : ne montre que 2-3 cartes, et la carte
  demandée porte une bande de 4 glyphes + une date sous la vignette — la hauteur requise
  rend le défilement horizontal peu praticable ;
- **grille verticale** ordonnée par date décroissante : montre 6-8 cartes d'un coup, garde
  l'ordre demandé, et supporte la bande + la date.

**Recommandation : `LazyVGrid`** (`GridItem(.adaptive(minimum: 108), spacing: 12)` →
3 colonnes iPhone, 5-6 iPad), triée `createdAt` décroissant. Coût du revirement : le
conteneur d'un onglet, pas la carte.

### 4.3 Où vont les sections existantes

| Section actuelle | Onglet cible | Forme |
|---|---|---|
| `activeUpload` (l.101-110) | **Publiées** | `ActiveUploadBanner` pleine largeur, en `.safeAreaInset(edge: .top)` sous le Picker — inchangé |
| « Échecs de publication » (l.111-123) | **Brouillons** | Section en liste (pas en grille) au-dessus de la grille des brouillons |
| Stories publiées (l.124-154) | **Publiées** | `LazyVGrid` de `MyStoryCard` |
| Brouillons (nouveau) | **Brouillons** | `LazyVGrid` de `MyStoryCard` |

**Pourquoi les échecs passent dans « Brouillons » :** un item en échec est du travail **non
publié**. Le laisser sous un onglet nommé « Publiées » fait mentir le titre. Le spec du
2026-08-01 (l.43-50) exige une *section distincte* des brouillons — c'est satisfait par un
en-tête de section propre à l'intérieur de l'onglet, et l'échec ne devient un brouillon
qu'à l'action « Reprendre », comme tranché. Un badge sur l'onglet Brouillons
(`drafts + failures`) le rend découvrable depuis « Publiées ».

**Pourquoi le bandeau d'upload reste dans « Publiées » :** il devient une story publiée dans
les secondes qui suivent ; le déplacer ferait sauter la carte d'un onglet à l'autre à la
fin de l'upload.

### 4.4 États vides

Deux `EmptyStateView` distincts (le composant supporte déjà `actionLabel` / `onAction`,
`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift:22-26` — non exploité
par le code actuel l.93-98, gain gratuit) :

- **Publiées vide** : icône `rectangle.stack.badge.xmark`, action « Créer une story »
  (`onCreateStory`) ;
- **Brouillons vide** : icône `square.and.pencil`, action « Créer une story ».

### 4.5 Ce qui devient des sheets

`MyStoriesDraftTarget` (nouveau) : le tap sur une carte brouillon remonte via
`onOpenDraft(draftId:)` jusqu'à `StoryTrayView`, qui **ferme la sheet avant** de présenter le
composer en `fullScreenCover` — même patron anti-course que `onCreateStory`
(`StoryTrayView.swift:136-145`) et `onEditStory` (l.147-…). À câbler **aux deux** call sites
(§ 7.9).

---

## 5. « Programmer la publication » — capacité NOUVELLE

### 5.1 Ce que le dépôt n'a pas

- **Aucun champ de planification côté données** : `grep -rn "scheduledAt\|publishAt\|scheduledFor"
  packages/shared/prisma/schema.prisma` → vide ; idem sur `services/gateway/src`. Le backend
  n'a aucune notion de publication différée, ni pour les posts, ni pour les stories.
- **`StoryPublishQueue` n'a pas d'échéance** : `StoryPublishQueueItem`
  (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift:15-47`) porte
  `createdAt`, `retryCount`, `lastError` — pas de date de déclenchement. Et l'enregistrement
  du handler déclenche un auto-drain immédiat (`StoryPublishService.swift:78-82`) : un item
  « programmé » y partirait tout de suite.
- **Aucun identifiant BG dédié** : `apps/ios/Meeshy/Info.plist:5-10` liste trois identifiants
  (`conversation-sync`, `message-prefetch`, `cache.background-flush`) ;
  `BackgroundTaskManager.registerTasks` (l.44-77) n'en enregistre que deux.

### 5.2 Les deux architectures possibles

**A — serveur (correcte).** `Post.scheduledAt DateTime?` + exclusion des feeds tant que
`scheduledAt > now` + un worker qui bascule à l'échéance. Touche : schema Prisma, migration
MongoDB, `PostService.createPost`, les filtres de `PostFeedService.getStories` / `getFeed`
(qui portent déjà un prédicat temporel sur `expiresAt`, `PostFeedService.ts:266`), un
scheduler, ses tests. **Et le Prisme** : la traduction NLLB doit se faire à la
**publication**, pas à la création — sinon une story programmée puis éditée est diffusée avec
la traduction de l'ancien texte.

**B — client seul (dégradée).** Le brouillon porte une `scheduledAt` locale ; un
`BGProcessingTask` neuf tente la publication à l'échéance, avec une notification locale de
rappel en filet. `BGTaskScheduler.earliestBeginDate` n'est qu'un **plancher** : l'OS décide,
une story « à 18 h » peut partir à 21 h. Et **app tuée par l'utilisateur = plus aucun réveil
jusqu'à relance manuelle** : rien ne part. Une fonction dont le nom promet une garantie ne
peut pas être livrée sur ce socle.

### 5.3 Recommandation : sortir du lot

**Chiffrage relatif** (base 1 = le lot deux-onglets complet, incréments 0-6) :

| Option | Coût relatif | Verdict |
|---|---|---|
| Lot deux-onglets (client pur) | **1,0** | à faire |
| A — planification serveur | **1,8 – 2,2** | lot séparé, après |
| B — planification client seule | **0,4** | à rejeter (promesse non tenue) |

L'entrée de menu existe dès l'incrément 5, mais elle est **filtrée par le résolveur** tant
que `MyStoriesCapabilities.scheduling == false` — la bande de brouillon est ainsi livrée
complète sans afficher une action qui ment. Le test
`test_menu_draft_schedulingDisabled_omitsSchedule` verrouille ce comportement.

---

## 6. Ordre d'implémentation — incréments livrables

Chaque incrément compile, passe `./apps/ios/meeshy.sh test`, et se commite seul.

### Inc. 0 — Ré-ancrer les gardes de source (RED puis GREEN, zéro code produit)

Cinq fichiers de tests lisent `Meeshy/Features/Main/Views/MyStoriesView.swift` en dur et
découpent sur des ancres qui vont disparaître (§ 7.10). Les ré-ancrer **avant** de bouger
quoi que ce soit : sur le comportement (les glyphes existent, dans cet ordre, masqués du
rotor), pas sur des fenêtres de caractères — leçon
`reference_source_guard_fixed_char_windows_rot`.

*Risque* : sur-corriger et transformer une garde en tautologie. Contre-mesure : chaque
assertion réécrite doit d'abord échouer sur la version cible imaginée, puis passer.

### Inc. 1 — Les cinq helpers purs, sans UI

`StoryPublicationDateResolver`, `MyStoryLifecycleResolver`, `MyStoryActionSetResolver`,
`MyStoriesTabResolver`, `MyStoriesEmptyStateResolver` (signature par onglet). ~30 tests.
Aucune vue touchée sauf `MyStoriesView` qui adopte la nouvelle signature d'état vide.

*Risque* : faible. Le seul écueil est de dupliquer la règle d'expiration au lieu de déléguer
à `StoryItem.isExpired` — verrouillé par
`test_lifecycle_agreesWithStoryItemIsExpired_acrossBoundary`.

### Inc. 2 — Extraction iso-visuelle

`MyStoryCard` + `MyStoryThumbnail` + `MyStoryActionBar` + `MyStoryCardModel` + les
déplacements de fichiers. **La `List` reste une `List`, le rendu reste identique au pixel.**
L'observation de `StoryPhotoSaveService` remonte dans `MyStoriesView`.

*Risque* : régression visuelle silencieuse. Contre-mesure : capture avant/après sur le simu
18.2 (`30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`), et la suite existante
`MyStoriesCommentsButtonTests` (ré-ancrée en inc. 0) garde l'ordre des glyphes.

### Inc. 3 — Archive locale des périmées

`StoryArchiveMerge` (SDK) + branchement à `StoryViewModel.swift:417`. **Aucune UI.** Sans
cet incrément, la carte voilée de l'inc. 4 disparaît au premier pull-to-refresh.

*Risque* : ressusciter une story supprimée. Contre-mesure : ne réinjecter que ce qui est
périmé à `now` — une story supprimée mais encore vivante n'est pas périmée, donc pas
réinjectée ; les tombstones (`meta.deletedStoryIds`, `StoryViewModel.swift:371`) continuent
de purger. Verrouillé par `test_merging_ownLiveStoryAbsentFromServer_isNotResurrected`.

*Risque secondaire* : croissance non bornée de l'archive locale. Poser un plafond explicite
(les N=50 plus récentes périmées) dans la fonction pure, avec son test.

### Inc. 4 — Les deux onglets, l'onglet Publiées complet

`Picker` + `switch` + `MyStoriesPublishedTab` (`LazyVGrid`, voile, date par carte) +
`MyStoriesDraftsTab` **vide** (état vide seul). L'onglet Brouillons existe et est
sélectionnable, il n'a simplement rien à montrer.

*Risque* : perte de `swipeActions` en passant de `List` à `LazyVGrid` (§ 7.14). Contre-mesure :
la suppression repasse par `.contextMenu` + le « … », et une `.accessibilityAction`
« Supprimer » explicite remplace le chemin VoiceOver du balayage.

### Inc. 5 — L'onglet Brouillons alimenté

`StoryDraftsViewModel` + `StoryDraftListing` + `MyStoriesDraftTarget` + câblage des deux
call sites de `StoryTrayView`. Les échecs de publication migrent dans cet onglet.

**Dépendance dure : l'incrément 3 du spec** (identité de brouillon dans le composer). Tant
que `StoryComposerView+SyncRestore.swift` appelle `StoryDraftStore.shared.load()` sans
`draftId`, la branche ne compile pas (§ 7.3). Cet incrément ne peut pas démarrer avant.

*Risque* : `listDrafts()` fait des lectures GRDB synchrones sur le `body` si on l'appelle
naïvement. Contre-mesure : `StoryDraftsViewModel` charge une fois à `.task`, expose un
`@Published [StoryDraftSummary]`, et se rafraîchit sur `willEnterForeground` — mêmes points
que `StoryPublishService.refreshQueueState` (`StoryPublishService.swift:167-171`).

### Inc. 6 — « Reprendre » un échec

Incrément 5 du spec, dans sa nouvelle maison (l'onglet Brouillons). L'ordre imposé par le
spec (copier les médias AVANT `discardFailedItem`) est déjà spécifié et testé là-bas.

### HORS LOT — « Programmer la publication »

Lot séparé, architecture A (§ 5). L'entrée de menu reste filtrée jusque-là.

---

## 7. Pièges concrets repérés en lisant le code

**7.1 — `@ObservedObject` sur un singleton, dans une cellule de liste.**
`apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift:641` :
`@ObservedObject var saveService: StoryPhotoSaveService`. Chaque tick de progression
d'enregistrement invalide **toutes** les lignes, y compris `textObjectsOverlay`
(l.921-938) qui reconstruit un `Text` positionné par objet texte. Violation directe de
« Leaf Views — Zero @ObservedObject Singleton » (`apps/ios/CLAUDE.md`). En grille à
3 colonnes, le nombre de vues invalidées triple.

**7.2 — La carte « périmée » s'efface au pull-to-refresh.**
`services/gateway/src/services/PostFeedService.ts:266` exclut `expiresAt <= now` pour tous, y
compris l'auteur. `StoryViewModel.swift:417` fait `storyGroups = groups`. La protection
d'auteur existe côté PURGE (`StoryTrayPurge.swift:87`) mais pas côté OVERWRITE. Le chemin
delta (`insertOrMergeStoryGroups`, l.363) est additif donc inoffensif ; c'est le **full
fetch** (cache `.expired`/`.empty`, `forceNetwork: true`, repli après échec delta) qui
efface. → inc. 3.

**7.3 — La branche ne compile pas en l'état, côté composer.**
`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift:200, 271, 303,
313, 338, 364, 371, 399` appellent `save(slides:visibility:)`, `load()`, `loadMedia()`,
`loadMediaReferences()`, `saveCommandHistoryBlob(_:)` **sans `draftId`**. Ces signatures
n'existent plus : `StoryDraftStore.swift:258, 312, 429, 489, 538, 584` les prennent toutes.
L'inc. 5 est bloqué tant que l'incrément 3 du spec n'a pas atterri.

**7.4 — Tri O(n log n) reconstruit à chaque `body`.**
`MyStoriesView.swift:73-76` : `stories` trie à chaque évaluation, et `body` est réévalué à
chaque tick de `publishService` (`@StateObject` l.45) et de `viewModel` (`@ObservedObject`
l.20). En `LazyVGrid`, ce tri est en amont du `ForEach` : il repart entier à chaque tick.

**7.5 — Sélection en O(n²) par rendu.**
`MyStoriesView.swift:81-83` : `selectedStoryIDs` reconstruit `stories.map(\.id)` (parcours
complet), et le résultat est lu dans le `ForEach` à l.130 → un parcours par cellule. Invisible
à 50 stories, mesurable dès que la carte devient plus lourde que la ligne.

**7.6 — `RelativeDateTimeFormatter` alloué à chaque évaluation, et hors norme du projet.**
`MyStoriesView.swift:1025` construit un `RelativeDateTimeFormatter()` neuf dans une propriété
calculée lue par `body`. Le SDK a `RelativeTimeFormatter`
(`packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift:72`) avec sa boîte
de formatters thread-safe (l.181-…). Deux échelles de temps différentes cohabitent donc dans
le même écran. À corriger pendant le déplacement de `FailedStoryRow`.

**7.7 — `RelativeTimeFormatter.longString` ne bascule qu'à 90 jours.**
`RelativeTimeFormatter.swift:92` : `if dayDelta < 90 { return ago(monthsLabel(dayDelta / 30)) }`.
Le produit demande la bascule à **1 mois**. Et `absoluteDate` est `private` (l.169). D'où le
découpage décision (`format`) / rendu (`label`) du § 3.1 — surtout ne pas dupliquer l'échelle
de `RelativeTimeFormatter` dans le nouveau résolveur.

**7.8 — VoiceOver dit « il y a il y a 3 jours ».**
`MyStoriesView.swift:1064` interpole `"Story non publiée, il y a \(relativeTime)"` alors que
`relativeTime` (l.1025) est produit par `RelativeDateTimeFormatter.localizedString`, qui
contient **déjà** « il y a ». Bug existant, à corriger au passage.

**7.9 — `MyStoriesView` est instanciée à DEUX endroits.**
`StoryTrayView.swift:120` et `StoryTrayView.swift:779`, avec des blocs de callbacks
dupliqués. Tout nouveau callback (`onOpenDraft`, `onResumeFailedItem`) doit être câblé aux
deux, sinon l'un des deux chemins d'accès à « Mes stories » ouvre un onglet Brouillons muet.
Et la garde existante ne rattrape pas l'oubli : `MyStoriesCreateStoryGuardTests.swift:34`
utilise `range(of: "onCreateStory: {")` qui s'arrête à la **première** occurrence.

**7.10 — Cinq fichiers de tests lisent `MyStoriesView.swift` en dur.**
`MyStoriesBulkDeleteGuardTests.swift:19, 32, 56` · `MyStoriesCommentsButtonTests.swift:47` ·
`MyStoriesFailedItemsGuardTests.swift:19, 40` · `MyStoryRowSaveRingTests.swift:101` ·
`MyStoriesCreateStoryGuardTests.swift:19`.
Le plus fragile : `MyStoriesCommentsButtonTests.rowBody()` (l.87-110) découpe entre
`"private struct MyStoryRow<MenuContent: View>: View {"` et
`"private var rowAccessibilityLabel: String {"`. Faire disparaître `MyStoryRow` ou renommer
l'une des deux ancres rend rouges huit assertions **sur du code correct**. → inc. 0.

**7.11 — Lecture de singleton dans `body`.**
`MyStoriesView.swift:68-70` : `accentColor` interroge `AuthManager.shared.currentUser` à
chaque évaluation. À hisser en `let` calculé une fois, et à passer aux cartes en **hex
`String`** (stable, comparable, lisible en test) — pas en `Color`.

**7.12 — L'anneau supprime le menu, et c'est voulu.**
`MyStoriesView.swift:750-771` : pendant un enregistrement, l'anneau **remplace** le « … »,
donc le menu d'actions est inaccessible. Le produit demande explicitement de conserver ce
comportement. Il doit donc être encodé dans `MyStoryActionSetResolver.glyphs(…, saveProgress:)`
et non dans un `if` inline de la carte — sinon il se re-dupliquera dans la carte brouillon.

**7.13 — « Republier » n'est pas gaté sur `isPublic`, contrairement à la doc du modèle.**
`MyStoriesView.swift:381-386` propose « Republier » sans condition, alors que
`StoryItem.isPublic` (`StoryModels.swift:1997-2002`) se documente comme servant à
« gate the Partager button and kebab items ». Incohérence existante. **À trancher avant
d'écrire `test_menu_publishedNonPublic_omitsRepost`** : le résolveur devient la source unique,
il figera ce qu'on y met. Ne pas changer le comportement en silence.

**7.14 — `swipeActions` n'existe pas en `LazyVGrid`.**
`MyStoriesView.swift:140-152` (stories) et l.115-119 (échecs) reposent sur `.swipeActions`,
une affordance de `List`. Le passage en grille la supprime — et avec elle un chemin VoiceOver
sur lequel le commentaire l.783-792 s'appuie explicitement. Il faut : `.contextMenu`
(qui survit), l'entrée « Supprimer » du « … », **et** une `.accessibilityAction` dédiée. La
section « Échecs de publication » reste en liste, donc elle garde son balayage.

**7.15 — Cible tactile sous 44 pt.**
`MyStoriesView.swift:719, 744, 766` : `Image(size: 15…16)` + `.padding(8)` ≈ 31-34 pt. Sous le
minimum HIG. La bande cible impose `.frame(minWidth: 44, minHeight: 44)` par glyphe — ce qui
contraint aussi la largeur minimale de carte de la grille (3 colonnes iPhone maximum pour
loger 4 glyphes de 44 pt, soit ~108 pt utiles + marges).

**7.16 — Clés de localisation.**
Toute clé neuve écrite en `String(localized:defaultValue:)` sans entrée dans
`apps/ios/Meeshy/Localizable.xcstrings` s'affiche **en français pour tous** — le cliquet
français documenté du projet. Les ~14 clés du lot (onglets, deux états vides, actions
brouillon, libellés a11y de date et de voile) sont à déclarer explicitement dans le
catalogue, pas seulement en `defaultValue`.

---

## 8. Récapitulatif des tests

| Cible | Fichier | ~Nb |
|---|---|---|
| Date relative/absolue | `MeeshyTests/Unit/Views/StoryPublicationDateResolverTests.swift` | 5 |
| Cycle de vie | `MeeshyTests/Unit/Views/MyStoryLifecycleResolverTests.swift` | 5 |
| Jeu d'actions | `MeeshyTests/Unit/Views/MyStoryActionSetResolverTests.swift` | 10 |
| État vide par onglet | `MeeshyTests/Unit/Views/MyStoriesEmptyStateResolverTests.swift` (réécrit) | 6 |
| Onglet initial | `MeeshyTests/Unit/Views/MyStoriesTabResolverTests.swift` | 4 |
| Archive périmées | `MeeshySDKTests/Models/StoryArchiveMergeTests.swift` | 6 |
| ViewModel brouillons | `MeeshyTests/Unit/ViewModels/StoryDraftsViewModelTests.swift` (+ `MockStoryDraftListing`) | 6 |
| Gardes de source ré-ancrées | 5 fichiers existants | ~12 réécrits |

Phase de `meeshy.sh test` : toutes ces suites matchent `FINAL_PHASE_CLASS_PATTERN` (tokens
`Story`, `Draft`) → **phase 2**. `StoryArchiveMergeTests` tourne en **phase 0** (suite SPM du
SDK) et fait partie du verdict du gate depuis 2026-07-30.

---

## 9. Questions ouvertes à trancher avant l'inc. 4

1. **Carrousel horizontal ou grille verticale** pour l'onglet Publiées (§ 4.2) ? La
   recommandation est la grille ; le verbatim dit « carrousselle ».
2. **« Republier » sur une story non publique** : comportement actuel conservé, ou aligné sur
   la documentation de `StoryItem.isPublic` (§ 7.13) ?
3. **Plafond de l'archive locale des périmées** (§ inc. 3) : 50 ? 100 ? Illimité est exclu.
4. **Le voile gris couvre-t-il la bande de glyphes ?** Le verbatim dit « thumbnails avec une
   voile grissé **avant d'avoir** la bande du bas » — lecture retenue : le voile s'arrête à la
   vignette, la bande reste pleinement contrastée (et donc pleinement actionnable). À
   confirmer.
