# Story Notifications UX & Reply-To-Story Banner Cleanup

**Date** : 2026-05-07
**Status** : Approved (brainstorming)
**Scope** : iOS app (`apps/ios/Meeshy`, `packages/MeeshySDK`)

## Problem

Deux defauts d'experience lies aux stories sur l'app iOS :

### Probleme 1 — Notifications de story sans contexte

Lorsqu'un utilisateur tape une notification liee a une story (commentaire, reaction), la navigation actuelle ouvre `PostDetailView(postId, showComments: true)` — vue unifiee posts+stories sans gestion specifique de l'expiration des stories. Resultats observes :

- Si la story a expire (au-dela de 24h), l'utilisateur tombe sur un ecran vide ne contenant qu'un composer de commentaire — pas d'information explicite que la story n'existe plus.
- Pas de chemin clair pour creer une nouvelle story depuis cet ecran.
- Si la story est encore active, le contexte (commentaire vs reaction) n'est pas reflete dans la presentation : pas de pre-affichage de la zone commentaires pour une notif de commentaire, pas de pre-affichage de la zone vues/reactions pour une notif de reaction.

### Probleme 2 — Banniere reply-to-story persistante

Quand l'utilisateur repond a une story et envoie ou cancel sa reponse, la banniere de reference a la story devrait disparaitre. Aujourd'hui elle reapparait en revenant dans la conversation. Cause racine : `composerState.pendingReplyReference` est bien remis a `nil` apres `send` / cancel (3 sites), mais `DraftStore` persiste un champ `replyToId` separement qui n'est jamais purge a ces evenements. A l'`onAppear` suivant, `ConversationView` lit le draft et restaure `pendingReplyReference` → la banniere reapparait comme un fantome.

## Goals

1. Donner du contexte aux notifications de story (story expiree → ecran dedie ; story active → vue avec sheet pre-deployee selon l'intent).
2. Reutiliser au maximum les composants existants (`StoryCanvasReaderView`, `StoryBackgroundPalette`).
3. Garder le router generique : un seul nouveau case suffit.
4. Corriger le bug de banniere reply-to-story persistante avec un fix minimal et localise.
5. Couverture TDD complete sur les nouvelles surfaces (ViewModels, helpers, composants).

## Non-Goals

- Pas de refonte de `PostDetailView` (vue posts non touchee).
- Pas de modification du backend / schema Prisma.
- Pas de nouvelle politique de retention des stories (24h reste la regle metier).
- Pas de flag de feature ou A/B test.
- Pas d'UX dediee pour le cas « send d'un reply quand la story sous-jacente vient d'expirer » : le backend decide (accepter ou refuser comme aujourd'hui).

## Decisions (issue du brainstorming)

| # | Question | Choix |
|---|----------|-------|
| Q1 | Couleur de fond de l'ecran « Story expiree » | Reutiliser la meme logique random (`StoryBackgroundPalette.randomBackgroundColor()`) — nouvelle couleur a chaque ouverture |
| Q2 | Contenu de l'ecran expiree | Avatar + nom acteur + emoji (reaction) ou extrait commentaire + titre « Story expiree » + CTA « Creer une story » |
| Q3 | Notif de commentaire (story active) | `StoryCanvasReaderView` fullscreen + sheet « Commentaires » pre-deployee |
| Q4 | Notif de reaction (story active) | `StoryCanvasReaderView` fullscreen + sheet « Vues / Reactions » pre-deployee |
| Q5 | Fix banniere reply persistante | Strict cleanup : purger `replyToId` du draft a chaque event explicite (send, cancel) |
| Approche | Architecture notifications | Smart route avec rendu adaptatif (un seul case dans le router, vue cible decide active vs expiree) |

## Architecture

### Vue d'ensemble

```
┌──────────────────────┐
│  NotificationRowView │  Tap notif story_comment / story_reaction
└──────────┬───────────┘
           ↓ router.push(.storyNotificationTarget(storyId, intent, context))
┌──────────────────────────────────────────┐
│ StoryNotificationTargetScreen            │
│  ├─ StoryNotificationTargetViewModel     │
│  │    └─ load() : cache-first, network   │
│  └─ switch state {                       │
│       .loading  → StoryNotificationLoadingView
│       .active   → StoryActiveContent     │
│                    └─ StoryCanvasReaderView + Sheet (comments|reactions)
│       .expired  → StoryExpiredContent    │
│                    └─ random bg + actor + cta
│     }                                    │
└──────────────────────────────────────────┘
```

## Section 1 — Route & Navigation

Etend `Router.Route` (`apps/ios/Meeshy/Features/Main/Navigation/Router.swift`) avec **un seul** nouveau case :

```swift
case storyNotificationTarget(storyId: String, intent: StoryIntent, context: NotificationContext)
```

Avec :

```swift
enum StoryIntent: Hashable, Codable {
    case comments        // notif commentaire → sheet commentaires deployee
    case reactions       // notif reaction → sheet vues/reactions deployee
}

struct NotificationContext: Hashable, Codable {
    let actorAvatar: String?
    let actorDisplayName: String
    let trigger: Trigger
    let occurredAt: Date

    enum Trigger: Hashable, Codable {
        case reaction(emoji: String)
        case comment(preview: String)
    }
}
```

Au tap dans `NotificationRowView` (ou handler centralise) :

```swift
switch notification.type {
case .storyReaction:
    router.push(.storyNotificationTarget(
        storyId: notification.context.postId,
        intent: .reactions,
        context: NotificationContext(from: notification)
    ))
case .storyComment, .commentReply where notification.metadata.postType == "STORY":
    router.push(.storyNotificationTarget(
        storyId: notification.context.postId,
        intent: .comments,
        context: NotificationContext(from: notification)
    ))
default:
    // routing existant inchange
}
```

**Le router reste generique** : aucune logique metier n'est ajoutee dedans. Pas de helper « decide la route ». La decision active vs expiree appartient a la vue cible.

## Section 2 — Ecran cible `StoryNotificationTargetScreen`

Nouveau dossier : `apps/ios/Meeshy/Features/Stories/Notifications/`.

### Machine a etats

```swift
enum LoadState {
    case loading              // chargement initial, pas encore de cache
    case active(APIStory)     // story chargee et non expiree
    case expired              // story expiree OU introuvable
}
```

### ViewModel

```swift
// StoryNotificationTargetViewModel.swift
@MainActor
final class StoryNotificationTargetViewModel: ObservableObject {
    @Published private(set) var state: LoadState = .loading

    let storyId: String
    let intent: StoryIntent
    let context: NotificationContext

    private let storyService: StoryServiceProviding

    init(
        storyId: String,
        intent: StoryIntent,
        context: NotificationContext,
        storyService: StoryServiceProviding = StoryService.shared
    ) {
        self.storyId = storyId
        self.intent = intent
        self.context = context
        self.storyService = storyService
    }

    func load() async {
        // 1. Cache-first
        if let cached = storyService.cachedStory(id: storyId) {
            state = isExpired(cached) ? .expired : .active(cached)
        }
        // 2. Network revalidation
        do {
            let fresh = try await storyService.fetchStory(id: storyId)
            state = isExpired(fresh) ? .expired : .active(fresh)
        } catch {
            if case .loading = state {
                state = .expired
            }
        }
    }

    private func isExpired(_ story: APIStory) -> Bool {
        guard let expiresAt = story.expiresAt else { return false }
        return expiresAt <= Date.now
    }
}
```

### Vue racine

```swift
struct StoryNotificationTargetScreen: View {
    @StateObject private var vm: StoryNotificationTargetViewModel

    init(storyId: String, intent: StoryIntent, context: NotificationContext) {
        _vm = StateObject(wrappedValue: StoryNotificationTargetViewModel(
            storyId: storyId, intent: intent, context: context
        ))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .loading:
                StoryNotificationLoadingView()
            case .active(let story):
                StoryActiveContent(story: story, intent: vm.intent)
            case .expired:
                StoryExpiredContent(storyId: vm.storyId, context: vm.context)
            }
        }
        .task { await vm.load() }
    }
}
```

### Protocole `StoryServiceProviding`

A ajouter (ou etendre) dans `MeeshySDK` :

```swift
protocol StoryServiceProviding: AnyObject {
    func cachedStory(id: String) -> APIStory?
    func fetchStory(id: String) async throws -> APIStory
}
```

(Conforme a la regle iOS TDD : protocole defini avant implementation, mock-friendly.)

### Pourquoi ce decoupage

- Trois sous-composants independants, chacun avec une responsabilite claire et testable isolement.
- Le ViewModel ne sait rien du rendu : il publie un etat. Test unitaire = injection de mock.
- Cache-first conforme au principe « instant app » du codebase.
- Tolerant aux changements : si la story bascule expired pendant le load, on rerend en `.expired` automatiquement.

## Section 3 — `StoryExpiredContent`

Nouveau fichier : `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift`.

### Composition

```
┌────────────────────────────────────┐
│ ●  Marie Dubois         il y a 2h  │  ← header acteur
│                                    │
│              😍                     │  ← icone trigger (emoji ou bulle)
│       « Trop belle ta photo »      │  ← extrait (.comment uniquement)
│                                    │
│         Story expiree              │  ← titre principal
│   Cette story n'est plus           │  ← sous-titre explicatif
│   disponible.                      │
│                                    │
│      [ +  Creer une story ]        │  ← CTA principal
│      Retour aux notifications      │  ← lien secondaire
└────────────────────────────────────┘
   ↑ fond random via StoryBackgroundPalette
```

### Fond random

Ajout dans `StoryBackgroundPalette` (fichier `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`) d'un helper qui retourne directement un `Color` (l'API actuelle retourne un `String` hex) :

```swift
extension StoryBackgroundPalette {
    static func randomBackgroundColorAsColor() -> Color {
        Color(hex: randomBackgroundColor())
    }
}
```

Stockage en `@State` dans `StoryExpiredContent` → genere une fois a l'init de la vue, ne re-randomize pas a chaque rerender :

```swift
@State private var background: Color = StoryBackgroundPalette.randomBackgroundColorAsColor()
```

### Lisibilite (luminance adaptative)

Le fond pouvant etre tres clair ou tres fonce, le texte/CTA s'adapte :

```swift
private var foregroundOnBackground: Color {
    background.luminance > 0.6 ? .black : .white
}
```

Helper `Color.luminance` a ajouter dans `MeeshyColors.swift` si absent (formule WCAG : `0.2126*R + 0.7152*G + 0.0722*B` apres linearisation sRGB).

### Implementation

```swift
struct StoryExpiredContent: View {
    let storyId: String
    let context: NotificationContext

    @EnvironmentObject private var router: Router
    @State private var background: Color = StoryBackgroundPalette.randomBackgroundColorAsColor()

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            VStack(spacing: 24) {
                actorHeader
                triggerVisual
                triggerExcerptIfAny
                titleBlock
                createStoryCTA
                backLink
            }
            .padding(.horizontal, 32)
        }
        .foregroundStyle(foregroundOnBackground)
    }

    @ViewBuilder private var actorHeader: some View { ... }
    @ViewBuilder private var triggerVisual: some View { ... }
    @ViewBuilder private var triggerExcerptIfAny: some View { ... }
    @ViewBuilder private var titleBlock: some View { ... }
    @ViewBuilder private var createStoryCTA: some View { ... }
    @ViewBuilder private var backLink: some View { ... }
}
```

### CTA « Creer une story »

```swift
Button {
    router.push(.storyComposer)
} label: {
    Label(L("notifications.story.expired.cta.create"), systemImage: "plus.circle.fill")
}
```

Si `Router.Route.storyComposer` n'existe pas encore, on l'ajoute (un seul case, non touchant aux autres fonctionnalites).

### Localizations

Cles a ajouter dans `apps/ios/Meeshy/Localizable.xcstrings` (FR primaire, EN secondaire selon convention) :

| Cle | FR | EN |
|-----|----|----|
| `notifications.story.expired.title` | Story expiree | Story expired |
| `notifications.story.expired.subtitle` | Cette story n'est plus disponible. | This story is no longer available. |
| `notifications.story.expired.cta.create` | Creer une story | Create a story |
| `notifications.story.expired.back` | Retour aux notifications | Back to notifications |

## Section 4 — `StoryActiveContent`

Nouveau fichier : `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveContent.swift`.

### Strategie

Reutiliser `StoryCanvasReaderView` (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`) en injectant la sheet initiale. Le wrapper `StoryActiveContent` est un orchestrateur leger.

```swift
struct StoryActiveContent: View {
    let story: APIStory
    let intent: StoryIntent

    @State private var presentedSheet: StorySheetKind?
    @State private var canvasIsPaused: Bool = false

    var body: some View {
        StoryCanvasReaderView(story: story, isPaused: $canvasIsPaused)
            .onAppear { presentedSheet = initialSheet }
            .sheet(item: $presentedSheet) { kind in
                sheetView(for: kind)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(.thinMaterial)
            }
            .onChange(of: presentedSheet) { _, new in
                canvasIsPaused = (new != nil)
            }
    }

    private var initialSheet: StorySheetKind {
        switch intent {
        case .comments:  return .comments
        case .reactions: return .reactions
        }
    }

    @ViewBuilder
    private func sheetView(for kind: StorySheetKind) -> some View {
        switch kind {
        case .comments:  StoryCommentsSheet(story: story)
        case .reactions: StoryReactionsSheet(story: story)
        }
    }
}

enum StorySheetKind: String, Identifiable {
    case comments, reactions
    var id: String { rawValue }
}
```

### Sheets — reutilisation ou creation

A auditer dans le plan d'implementation :

1. **`StoryCommentsSheet`** : si une zone commentaires existe deja dans `StoryCanvasReaderView` (declenchee par swipe-up ou bouton), l'extraire en composant standalone reutilisable. Sinon la creer.
2. **`StoryReactionsSheet`** : audit pre-implementation a marque qu'aucune `StoryViewersListView` dediee n'a ete trouvee. Probablement a creer :

```swift
struct StoryReactionsSheet: View {
    let story: APIStory

    var body: some View {
        NavigationStack {
            List {
                Section(L("story.insights.reactions")) { reactionRows }
                Section(L("story.insights.viewers")) { viewerRows }
            }
            .navigationTitle(L("story.insights.title"))
        }
    }
}
```

Donnees : viennent du payload `story.reactions` + `story.viewers` si exposes par le SDK ; sinon ajouter `StoryService.fetchInsights(storyId:)`.

### Pause auto du canvas

`StoryCanvasReaderView` lit aujourd'hui sa progression automatiquement. Pendant l'ouverture de sheet on doit pauser le timer pour ne pas auto-skip a la story suivante. Si le canvas n'expose pas deja un `@Binding` de pause, on l'ajoute. Le `StoryActiveContent` synchronise via `onChange(of: presentedSheet)`.

A confirmer dans le plan d'implementation : si le canvas a deja un mecanisme equivalent, l'utiliser ; sinon ajouter le binding.

### Detents et UX

Sheet en `.medium` par defaut → laisse le canvas visible derriere, geste familier (drag pour etendre, swipe-down pour fermer). Quand l'utilisateur ferme la sheet, on ne re-presente PAS automatiquement → il reste sur le canvas reader, libre d'explorer.

## Section 5 — Bug fix : banniere reply persistante

### Cause racine

`composerState.pendingReplyReference` est bien remis a `nil` apres `send` / cancel banner (3 sites). MAIS `DraftStore` persiste un champ `replyToId` separement, jamais purge a ces meme evenements → fantome a l'`onAppear` suivant.

### Semantique cible

| Evenement | `pendingReplyReference` | `draft.replyToId` |
|-----------|-------------------------|-------------------|
| Tap reply (story/message) | defini | defini |
| User tape, ferme app, revient | conserve | conserve |
| Story expire pendant ce temps | conserve | conserve |
| **User envoie le message** | nulle | **nulle** ← fix |
| **User tape X sur banner (cancel)** | nulle | **nulle** ← fix |

Aucune purge automatique sur `onAppear`. Aucun check d'existence de la story. La banniere reste sous l'autorite de l'utilisateur jusqu'a un acte explicite (send ou cancel).

### Fix

#### 1. Methode atomique dans `DraftStore`

Fichier : `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`

```swift
extension DraftStore {
    /// Purge la reference reply du draft. Texte et attachments preserves.
    func clearReplyReference(conversationId: String) {
        guard var draft = drafts[conversationId] else { return }
        draft.replyToId = nil
        drafts[conversationId] = draft
        persistDraft(draft, for: conversationId)
    }
}
```

#### 2. Helper centralise dans `ConversationView`

```swift
private func clearReplyContext() {
    composerState.pendingReplyReference = nil
    DraftStore.shared.clearReplyReference(conversationId: conversation.id)
}
```

#### 3. Mise a jour des 3 call sites existants

| Fichier | Action |
|---------|--------|
| `ConversationView+Composer.swift:66` (send sans attachment) | `composerState.pendingReplyReference = nil` → `clearReplyContext()` |
| `ConversationView+AttachmentHandlers.swift:76` (send avec attachments) | `composerState.pendingReplyReference = nil` → `clearReplyContext()` |
| `ConversationView+Composer.swift:245` (bouton X du banner) | `composerState.pendingReplyReference = nil` → `clearReplyContext()` |

**Aucun autre site touche.** Pas de garde-fou cote `onAppear`. Pas de TTL.

### Edge case « send avec story expiree »

Si l'utilisateur tape send sur un message dont `replyToId` pointe vers une story qui a expire entre-temps, le backend decide :
- soit il accepte le reply — comportement existant inchange,
- soit il refuse — l'erreur remonte dans le toast d'erreur de send classique.

La banniere ne fait rien de special. **Hors scope** de ce design.

## Section 6 — Strategie de tests TDD

### Pyramide

```
         ┌─────────────────────────────────┐
         │  Acceptance / scenario UI tests │   ← 3 scenarios end-to-end
         └─────────────────────────────────┘
       ┌────────────────────────────────────┐
       │     Component / SwiftUI snapshot   │   ← StoryExpiredContent, sheets
       └────────────────────────────────────┘
   ┌──────────────────────────────────────────┐
   │   Unit — ViewModels & Services           │   ← le gros du volume
   └──────────────────────────────────────────┘
```

### Tests unitaires (ViewModels & Services)

**`StoryNotificationTargetViewModelTests.swift`** :

```swift
func test_load_withCachedActiveStory_emitsActiveImmediately()
func test_load_withCachedExpiredStory_emitsExpiredImmediately()
func test_load_withoutCache_fetchesFromNetwork_thenEmitsActive()
func test_load_withoutCache_andNetwork404_emitsExpired()
func test_load_withoutCache_andNetworkError_emitsExpired_afterTimeout()
func test_load_cacheActive_butNetworkReturnsExpired_revalidatesToExpired()
func test_load_idempotent_canBeCalledMultipleTimes()
```

Mock : `MockStoryService: StoryServiceProviding` avec `Result<APIStory, Error>` stubs + `cachedStory(id:)` configurable.

**`DraftStoreReplyTests.swift`** :

```swift
func test_clearReplyReference_setsReplyToIdToNil()
func test_clearReplyReference_preservesText()
func test_clearReplyReference_preservesAttachments()
func test_clearReplyReference_persistsImmediately()
func test_clearReplyReference_unknownConversationId_noOp()
```

**`ConversationReplyContextTests.swift`** :

```swift
func test_sendMessage_purgesReplyToIdInDraft()
func test_sendMessageWithAttachments_purgesReplyToIdInDraft()
func test_cancelBanner_purgesReplyToIdInDraft()
func test_appReopen_doesNotPurgeReplyToIdAutomatically()
func test_clearReplyReference_preservesDraftText()
```

### Tests de composants SwiftUI

Pattern a verifier dans le codebase (`ViewInspector` vs snapshot vs simple init+assertion). A trancher dans le plan d'implementation.

**`StoryExpiredContentTests.swift`** :

```swift
func test_render_reactionTrigger_showsEmojiAndActor()
func test_render_commentTrigger_showsExcerptAndActor()
func test_backgroundColor_isStableWithinSameInstance()
func test_textColor_adaptsToLightBackground()
func test_textColor_adaptsToDarkBackground()
func test_createCTA_pushesStoryComposerRoute()
func test_backLink_dismissesAndReturnsToNotifications()
```

**`StoryActiveContentTests.swift`** :

```swift
func test_intentComments_presentsCommentsSheetOnAppear()
func test_intentReactions_presentsReactionsSheetOnAppear()
func test_dismissingSheet_doesNotRePresentAutomatically()
func test_canvasIsPaused_whileSheetIsPresented()
```

### Tests d'acceptation (UI tests)

**`StoryNotificationFlow.swift`** — 3 scenarios critiques :

```swift
func test_storyCommentNotificationTap_activeStory_opensCanvasWithCommentsSheet()
func test_storyReactionNotificationTap_expiredStory_opensExpiredScreenWithCTA()
func test_replyToStorySent_returningToConversation_bannerIsGone()
```

### Approche TDD

Strict RED-GREEN-REFACTOR (rappel `CLAUDE.md`) pour chaque incrément du plan d'implementation :
1. RED : ecrire 1 test qui echoue.
2. GREEN : ecrire le code minimum pour passer.
3. REFACTOR : amelioration uniquement si valeur ajoutee.

Chaque commit = 1 increment, code en etat vert (build + tests verts).

### Conventions a respecter

- **Pas de mock de `DraftStore`** : utiliser l'instance reelle avec un store ephemere (in-memory ou tmp dir). Le mock du `StoryService` reste OK (client reseau).
- **Schema `MeeshySDK-Package`** pour les tests SDK (voir `feedback_meeshysdk_test_scheme.md`).
- **Single shared `-derivedDataPath`** si tests paralleles (voir `feedback_xcodebuild_shared_derivedata.md`).
- **`MeeshyUI/` types pures** : `nonisolated` si necessaire, tests non `@MainActor` (voir `feedback_meeshyui_default_isolation.md`).

## Files to Create

| Path | Purpose |
|------|---------|
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift` | Vue racine, machine a etats |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift` | ViewModel cache-first + network |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift` | Skeleton de chargement |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveContent.swift` | Wrapper canvas + sheet |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift` | Ecran story expiree |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryCommentsSheet.swift` | Sheet commentaires (a auditer) |
| `apps/ios/Meeshy/Features/Stories/Notifications/StoryReactionsSheet.swift` | Sheet vues / reactions |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryNotificationTargetViewModelTests.swift` | Unit tests ViewModel |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryExpiredContentTests.swift` | Component tests |
| `apps/ios/MeeshyTests/Features/Stories/Notifications/StoryActiveContentTests.swift` | Component tests |
| `apps/ios/MeeshyTests/Features/Main/Services/DraftStoreReplyTests.swift` | Unit tests DraftStore |
| `apps/ios/MeeshyTests/Features/Main/Views/ConversationReplyContextTests.swift` | Tests bug fix banniere |
| `apps/ios/MeeshyUITests/Stories/StoryNotificationFlow.swift` | UI tests scenarios |

## Files to Modify

| Path | Changes |
|------|---------|
| `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` | + case `storyNotificationTarget` ; + case `storyComposer` si absent |
| `apps/ios/Meeshy/Features/Main/Views/RootView.swift` | Ajouter destination(for:) pour le nouveau case |
| `apps/ios/Meeshy/Features/Main/Views/NotificationRowView.swift` (et/ou handler centralise) | Mapper notif story → push de la nouvelle route |
| `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift` | + extension `clearReplyReference(conversationId:)` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | + helper `clearReplyContext()` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift` (lignes 66, 245) | Remplacer `pendingReplyReference = nil` par `clearReplyContext()` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` (ligne 76) | Idem |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (extension `StoryBackgroundPalette`) | + helper `randomBackgroundColorAsColor() -> Color` |
| `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift` (ou equivalent) | + extension `Color.luminance` si absente |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift` | + protocole `StoryServiceProviding` (ou conformite si proto deja existant) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | + `@Binding var isPaused: Bool` si absent |
| `apps/ios/Meeshy/Localizable.xcstrings` | + 4 cles de l'ecran expiree |

## Implementation Order (TDD-friendly)

1. **DraftStore fix (Section 5)** : isole, sans dependance avec le reste. Permet de fermer le bug rapidement.
   - RED → tests `DraftStoreReplyTests`, `ConversationReplyContextTests`
   - GREEN → `clearReplyReference`, `clearReplyContext`, mise a jour 3 call sites
2. **Protocole `StoryServiceProviding`** : extraction du protocole, conformite par `StoryService`.
3. **`StoryNotificationTargetViewModel`** : RED-GREEN sur les 7 tests unitaires.
4. **Helper `StoryBackgroundPalette.randomBackgroundColorAsColor`** + `Color.luminance`.
5. **`StoryExpiredContent`** : RED-GREEN sur les 7 tests composants.
6. **`StoryActiveContent`** + sheets : audit puis creation/extraction.
7. **Route `storyNotificationTarget`** + cablage `RootView` + `NotificationRowView`.
8. **UI tests scenarios** : 3 tests end-to-end.

Chaque etape est commitable independamment avec build et tests verts.

## Risks & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `StoryCanvasReaderView` n'expose pas de `@Binding isPaused` | Le canvas continue d'auto-skip pendant la sheet | Ajouter le binding (refacto local + non breaking pour les autres sites d'usage) |
| La sheet commentaires n'est pas extractible proprement (state interne au canvas reader) | Code duplique entre canvas reader et `StoryCommentsSheet` | Extraire la sheet en composant standalone ; le canvas reader presente la sheet via le meme composant |
| `StoryService` n'a pas de cache local | Pas de cache-first, toujours network | Acceptable : le ViewModel gere `cachedStory` retournant `nil` ; UX degradee a `loading` pendant 1 round-trip |
| `replyToId` est lu ailleurs que dans `ConversationView.onAppear` | Le fantome reapparait via un autre chemin | Audit grep `draft.replyToId` dans le plan d'implementation, etendre `clearReplyContext` aux call sites manquants si trouves |
| Notification de reaction ne contient pas le storyId mais un postId generique | Routing casse pour stories | Audit du payload `NotificationContext` ; si necessaire, enrichir le mapping cote NotificationRowView avec `metadata.postType == "STORY"` |

## Open Questions (a trancher dans le plan)

1. La sheet commentaires existe-t-elle deja dans `StoryCanvasReaderView` ? Si oui, comment l'extraire sans casser les autres sites d'usage ?
2. `StoryService` expose-t-il `viewers` et `reactions` complets dans `APIStory`, ou faut-il un endpoint `/insights` dedie ?
3. Le payload de notification `metadata.postType == "STORY"` est-il fiable pour distinguer story vs post classique ? Ou faut-il un type de notification dedie cote backend ?
4. La route `Router.Route.storyComposer` existe-t-elle deja ? Si non, OK pour l'ajouter dans ce plan.

## Success Criteria

- Tap sur notif story commentaire (story active) → ouvre `StoryCanvasReaderView` avec sheet commentaires deployee a `.medium`.
- Tap sur notif story reaction (story active) → ouvre `StoryCanvasReaderView` avec sheet vues/reactions deployee a `.medium`.
- Tap sur notif story (story expiree) → ouvre `StoryExpiredContent` avec fond colore random, contexte de la notif, CTA fonctionnel.
- Reply a une story, send → banniere disparait. Retour dans la conversation → banniere absente.
- Reply a une story, cancel via X → banniere disparait. Retour dans la conversation → banniere absente.
- Reply a une story, ferme app, revient sans send ni cancel → banniere conservee.
- Tous les tests TDD passent : unit, component, UI.
- `./apps/ios/meeshy.sh build` et `xcodebuild test` verts.
