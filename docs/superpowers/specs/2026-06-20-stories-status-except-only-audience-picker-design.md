# Stories/Status — picker d'audience EXCEPT/ONLY (Incrément 2)

**Date** : 2026-06-20
**Statut** : Design validé (brainstorming) — Incrément 2
**Périmètre** : iOS uniquement (MeeshyUI + app). Composer web = suivi séparé (décidé).
**Prérequis** : Incrément 1 livré (`...-stories-status-publication-mode-and-community-visibility-design.md`).

## 1. Contexte & problème

L'incrément 1 a exposé les modes **Public / Communautés / Contacts / Privé** dans les composers
story et status, en **masquant** `EXCEPT` et `ONLY` (`PostVisibility.composerSelectableCases =
[.public, .community, .friends, .private]`) parce qu'ils dépendent d'une **sélection
d'utilisateurs** dont l'UI n'existait pas. Cet incrément construit cette sélection et réactive
les deux modes.

Sémantique (déjà appliquée par le gateway) :
- **`ONLY`** : la story/status n'est visible **que** par les utilisateurs choisis.
- **`EXCEPT`** : visible par les contacts **sauf** les utilisateurs choisis.

### Découverte clé — le backend est déjà complet

Audit de code (Explore) : **toute la chaîne backend EXCEPT/ONLY existe et fonctionne déjà**.
Aucun travail gateway n'est requis (sauf une vérification, point 7).

| Élément | État | Référence |
|---|---|---|
| Champ de stockage | ✅ `Post.visibilityUserIds String[] @default([]) @db.ObjectId` | `schema.prisma` |
| Persistance création | ✅ `PostService.createPost` écrit `visibilityUserIds: data.visibilityUserIds ?? []` | `PostService.ts:~137` |
| Surfacing | ✅ `buildVisibilityFilter` : `ONLY → visibilityUserIds has viewer` ; `EXCEPT → friends NOT has viewer` | `PostFeedService.ts:762-773` |
| Gate réactions | ✅ `canUserViewPost` : `ONLY → includes(userId)` ; `EXCEPT → isFriend && !includes(userId)` | `posts/postVisibility.ts:42-62` |
| Broadcast | ✅ `getVisibilityFilteredRecipients` : `ONLY → visibilityUserIds` ; `EXCEPT → friends.filter(!in list)` | `SocialEventsHandler.ts:135-159` |
| Status iOS | ✅ `setStatus(visibilityUserIds:)` → `StatusService.create(visibilityUserIds:)` → `CreatePostRequest.visibilityUserIds` → `POST /posts` | déjà câblé |

Le travail restant est donc **quasi 100% UI iOS** : un picker réutilisable + son branchement
sur les deux composers, + la plomberie `visibilityUserIds` manquante du **composer story**.

## 2. Décisions (issues du brainstorming)

| Décision | Choix retenu |
|---|---|
| UX de sélection | **Sheet auto-présentée** au tap sur « Seulement… » / « Sauf… ». Capsule/chip affiche ensuite un compteur. |
| Périmètre | **iOS d'abord** : story + status. Composer web = suivi séparé. |
| Recherche | **Tous les utilisateurs** via `/users/search` (réutilise le pattern `NewConversationView`). |
| Placement du picker | **MeeshyUI** (`MeeshyUI` dépend de `MeeshySDK` → atteint `UserService.shared` ; les deux composers l'atteignent). |
| Empty selection | Autorisée, sans friction : `ONLY` ∅ = auteur seul ; `EXCEPT` ∅ = équivaut à Contacts. Pas de validation bloquante. |

## 3. Objectifs / Non-objectifs

### Objectifs (cet incrément)
- `AudienceUserPickerView` (MeeshyUI) : sheet réutilisable, recherche débouncée + multi-select,
  chips de sélection, agnostique (prend `mode`, `initialSelection`, `onDone`).
- `AudienceUserPickerViewModel` : VM testable, `UserServiceProviding` injecté (`.shared` défaut).
- Branchement **status** : présenter la sheet sur EXCEPT/ONLY, remplir `selectedUserIds` (déjà câblé).
- Branchement **story** : présenter la sheet ; **plomber `visibilityUserIds`** de bout en bout
  (callback `onPublishAllInBackground` → `StoryViewModel` → création story → `CreatePostRequest`).
- Réactiver `.except`/`.only` dans `PostVisibility.composerSelectableCases`.
- Vérifier que le broadcast temps réel story/status appelle bien `getVisibilityFilteredRecipients`
  (sinon corriger — une story ONLY ne doit pas fuiter en live à tous les amis).

### Non-objectifs
- Composer web (Next.js) — suivi séparé.
- Recherche limitée aux contacts / tri par contacts d'abord — YAGNI (recherche globale suffit).
- Édition de l'audience d'une story déjà publiée — hors périmètre (éphémère).
- Sélection de communautés précises — déjà tranché YAGNI à l'incrément 1.

## 4. Architecture

```
MeeshyUI
  AudienceUserPickerView (sheet)
    ├─ TextField débouncé (350ms) ──► AudienceUserPickerViewModel.search()
    │                                    └─ UserService.shared.searchUsers(q,limit,offset)  (SDK core)
    ├─ liste résultats (UserSearchResult) — toggle sélection
    ├─ chips sélectionnés (avatar + nom + ✕)
    └─ bouton OK ──► onDone([String])     // user IDs

  StoryComposerView (MeeshyUI)
    visibilityMenu : .except/.only ──► présente AudienceUserPickerView
                                       capsule = "Seulement (n)" / "Sauf (n)"
    onPublishAllInBackground(..., visibility, visibilityUserIds)   // +param

  StatusComposerView (app)
    visibilityPicker : .except/.only ──► présente AudienceUserPickerView
                                         remplit selectedUserIds (déjà câblé)

App
  StoryViewModel / publish closure  ──► createStory(..., visibilityUserIds)
                                        └─ CreatePostRequest.visibilityUserIds ──► POST /posts
```

## 5. Composant — `AudienceUserPickerView` (MeeshyUI)

**Nouveau fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift`

API publique (agnostique, respecte la pureté SDK — paramètres opaques, pas de décision produit) :
```swift
public struct AudienceUserPickerView: View {
    let mode: PostVisibility          // .except ou .only — pilote titre + copy
    let initialSelection: [String]    // IDs déjà choisis (vide en compose fraîche)
    let onDone: ([String]) -> Void    // sélection validée (au tap OK)
    // init avec userService injecté (défaut .shared) pour les tests
}
```

Comportement :
- Barre de recherche débouncée 350ms (constante locale, pattern `NewConversationView`).
- Résultats = `UserService.shared.searchUsers(query:limit:offset:)`, **exclut l'utilisateur courant**.
- Ligne sélectionnable : avatar (`MeeshyAvatar`), displayName/username, checkmark si sélectionné.
- Chips horizontaux des sélectionnés (avatar + nom + ✕), au-dessus de la liste.
- Titre/sous-titre selon `mode` : `.only` → « Seulement ces personnes » ; `.except` → « Tout le monde sauf ».
- `onDone(selectedIds)` au tap « OK » ; annulation (swipe/Annuler) → ne rappelle rien (conserve l'état parent).

### VM — `AudienceUserPickerViewModel`

Même fichier, au-dessus de la View (convention iOS). `@MainActor` (défaut MeeshyUI),
`ObservableObject`.
```swift
@MainActor
final class AudienceUserPickerViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var results: [UserSearchResult] = []
    @Published var selectedIds: [String] = []
    @Published var selectedUsers: [UserSearchResult] = []   // pour rendre les chips
    @Published var isSearching: Bool = false

    private let userService: UserServiceProviding
    private let currentUserId: String?

    init(initialSelection: [String],
         currentUserId: String?,
         userService: UserServiceProviding = UserService.shared)

    func performSearch() async        // appelle searchUsers, filtre self, publie results
    func toggle(_ user: UserSearchResult)  // ajoute/retire de selectedIds + selectedUsers
    func isSelected(_ id: String) -> Bool
}
```
Gotchas (mémoire) : `UserServiceProviding` est `Sendable`, méthodes `async throws` → appel
`await` depuis le VM `@MainActor`. Les tests `MeeshyUITests` sont **`nonisolated`** (coreSwiftSettings)
→ corps de test qui touchent le VM `@MainActor` doivent être marqués `@MainActor` explicitement.
Debounce : géré côté View via une `Task` annulable sur `query` (pas de timer dans le VM testé).

### Edge : chips pour IDs pré-seedés sans objet

`initialSelection` peut contenir des IDs sans `UserSearchResult` chargé (récupération d'un draft
status). Ces IDs restent dans `selectedIds` (donc rendus dans `onDone`) mais n'apparaissent en
chip qu'une fois matchés par une recherche. Acceptable (compose fraîche = liste vide ; cas rare).

## 6. Composant — branchement story (`StoryComposerView`, MeeshyUI)

État ajouté :
```swift
@State private var visibilityUserIds: [String] = []
@State private var audiencePickerMode: PostVisibility? = nil   // non-nil → sheet présentée
```
`visibilityMenu` (l.779-802) : pour un mode `requiresUserSelection`, le `Button` du menu pose
`visibility = mode.rawValue` **et** `audiencePickerMode = mode`. La capsule (label) affiche un
compteur quand `requiresUserSelection` et `!visibilityUserIds.isEmpty` (« Seulement (3) »).
`.sheet(item: $audiencePickerMode)` présente `AudienceUserPickerView(mode:, initialSelection:
visibilityUserIds, onDone: { visibilityUserIds = $0 })`. *(`PostVisibility` doit être `Identifiable`
pour `.sheet(item:)` — ajouter `var id: String { rawValue }`, ou utiliser un wrapper local.)*

Plomberie publication — le callback gagne un paramètre :
```swift
public var onPublishAllInBackground: (
    _ slides: [StorySlide], _ slideImages: [String: UIImage],
    _ loadedImages: [String: UIImage], _ loadedVideoURLs: [String: URL],
    _ loadedAudioURLs: [String: URL], _ originalLanguage: String?,
    _ visibility: String, _ visibilityUserIds: [String]    // +param
) -> Void
```
Le site d'appel (app) propage `visibilityUserIds` → `StoryViewModel` → création story →
`CreatePostRequest.visibilityUserIds` (le champ existe déjà). Si la création story ne passe pas
par `CreatePostRequest`, ajouter le paramètre à la méthode de création concernée jusqu'à la
requête `POST /posts`.

## 7. Composant — branchement status (`StatusComposerView`, app)

`selectedUserIds` est **déjà** câblé jusqu'à `setStatus(visibilityUserIds:)`. Ajouts :
```swift
@State private var audiencePickerMode: PostVisibility? = nil
```
Le `visibilityPicker` (l.237-276) : pour un mode `requiresUserSelection`, le `Button` pose
`selectedVisibility = vis` **et** `audiencePickerMode = vis`. `.sheet(item: $audiencePickerMode)`
→ `AudienceUserPickerView(mode:, initialSelection: selectedUserIds, onDone: { selectedUserIds = $0 })`.
Le chip du mode actif affiche le compteur quand `requiresUserSelection`.

## 8. Réactivation des modes

`PostVisibility.composerSelectableCases` (MeeshyUI/Story/PostVisibility.swift:46-48) passe à :
```swift
[.public, .community, .friends, .except, .only, .private]
```
Aucun autre changement d'enum (icônes/labels EXCEPT/ONLY existent déjà depuis l'incrément 1).

## 9. Vérification broadcast (gateway)

Confirmer que le broadcast story/status (`SocialEventsHandler.broadcastPostCreated` ou
équivalent) appelle `getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds)`
et **non** `getFriendIds(authorId)` brut. L'audit a noté un doute (`getVisibilityFilteredRecipients`
défini mais peut-être non appelé). Si le broadcast ignore la visibilité, une story `ONLY` ciblée
sur X serait poussée en live à tous les amis (fuite). Correction embarquée si avéré : router le
broadcast via `getVisibilityFilteredRecipients`. Test gateway si correction nécessaire.

## 10. Flux de données

**Publication ONLY** (story) : user choisit « Seulement… » → sheet → sélectionne [X,Y] →
`visibilityUserIds=[X,Y]` → publish → `createStory(visibility:"ONLY", visibilityUserIds:[X,Y])`
→ `POST /posts` → `createPost` persiste → broadcast `getVisibilityFilteredRecipients` → push à [X,Y].

**Surfacing** : `getStories(viewer)` → `buildVisibilityFilter` matche `ONLY si viewer ∈ visibilityUserIds`.
Viewer X reçoit ; viewer Z (hors liste) ne reçoit pas.

## 11. Edge cases
- `ONLY` avec sélection vide → visible par l'auteur seul (gateway : `has: viewer` faux pour tous).
- `EXCEPT` avec sélection vide → visible par tous les contacts (équivaut à Contacts).
- Self dans la recherche → filtré (ne pas se cibler/s'exclure soi-même).
- ID pré-seedé sans objet (draft) → conservé dans la sélection, chip différé (point 5).
- Bascule EXCEPT→ONLY→autre : la sélection est conservée tant qu'on reste sur un mode
  `requiresUserSelection` ; revenir à Public/Contacts n'envoie pas la liste (`requiresUserSelection`
  false → `visibilityUserIds: nil` au publish, logique existante du status).

## 12. Tests (TDD — RED→GREEN)

### iOS — `AudienceUserPickerViewModel` (XCTest, `MeeshyUITests`, **non-`@MainActor`** par défaut)
- `performSearch` peuple `results` depuis le mock `MockUserService`, **exclut** `currentUserId`.
- `toggle` ajoute puis retire un user de `selectedIds`/`selectedUsers` ; idempotent.
- `isSelected` reflète l'état.
- `initialSelection` non vide → `selectedIds` pré-rempli à l'init.
- Mock : `MockUserService: UserServiceProviding` avec `Result`-stub + compteur d'appels.

### iOS — enum
- `composerSelectableCases` inclut désormais `.except` **et** `.only` (met à jour le test existant
  de l'incrément 1 qui asserte leur absence).

### Gateway (seulement si correction broadcast nécessaire au point 9)
- Broadcast `ONLY` → recipients = `visibilityUserIds` ; `EXCEPT` → friends sauf la liste.

## 13. Vérification (gate)
- `./apps/ios/meeshy.sh build` OK.
- Tests SDK : scheme `MeeshySDK-Package` (le scheme MeeshyUI n'a pas d'action test).
- Si correction gateway : `tsc` gateway 0 erreur (fichiers touchés) + `jest` vert.
- Commit sélectif (WIP d'autres chantiers + worktree partagé avec agent parallèle).
