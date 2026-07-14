# Mes stories — liste comme point d'entrée + gestion complète

Date : 2026-07-14
Statut : Approuvé (design), en attente de plan d'implémentation

## Contexte

`MyStoriesView.swift` (livré le 2026-07-14, commit `4eda706e7`) fournit déjà une
vue liste des stories envoyées par l'utilisateur courant, avec suppression
(swipe + menu), lecture, partage (export MP4) et consultation des vues
(`StoryViewersSheet`). Elle est présentée en sheet depuis un item de menu
contextuel ("Gérer mes stories") sur l'avatar "Ma story" du tray.

L'utilisateur souhaite que cette liste devienne le point d'entrée **principal**
lorsqu'on consulte ses propres stories (au lieu du player plein écran direct),
et demande plusieurs compléments : création de story depuis la liste,
sélection multiple pour suppression groupée, vignettes proportionnelles au
contenu réel, et un fix de comportement — taper une ligne doit ouvrir la story
concernée (pas toujours la première du groupe).

## Périmètre

Cinq changements, tous dans des fichiers existants sous
`apps/ios/Meeshy/Features/Main/Views/` (et un fix dans le même dossier pour le
point d'entrée `postId`). Aucun composant SDK — rien ici n'est un atome
réutilisable agnostique du produit ; tout encode une décision UX Meeshy
(cf. test du grain, `packages/MeeshySDK/CLAUDE.md`).

1. Point d'entrée : tap avatar "Ma story" → toujours la liste
2. Fix : tap sur une ligne de liste → ouvre la story tapée (pas toujours l'index 0)
3. Bouton "Créer une story" dans la toolbar de `MyStoriesView`
4. Sélection multiple + suppression groupée
5. Vignettes à ratio proportionnel au contenu réel de la story

Hors périmètre : refonte visuelle de `MyStoryRow` au-delà de la vignette,
changement du flux de partage/republication, changement du flux de
consultation des vues (`StoryViewersSheet` reste inchangé — accessible via le
menu contextuel comme aujourd'hui).

## 1. Point d'entrée — tap avatar ouvre la liste

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`,
`MyStoryButton.body`, closure `onTap` (~ligne 394-401).

Comportement actuel :
```swift
onTap: {
    if hasMyStory {
        onViewMyStory()       // lecture plein écran directe
    } else {
        viewModel.showStoryComposer = true
    }
    HapticFeedback.medium()
}
```

Nouveau comportement :
```swift
onTap: {
    if hasMyStory {
        onManageStories?()    // ouvre MyStoriesView (liste)
    } else {
        viewModel.showStoryComposer = true
    }
    HapticFeedback.medium()
}
```

`onManageStories` est déjà un paramètre de `MyStoryButton` (toujours fourni par
le seul call site, `StoryTrayView.myStoryButton`) — aucun changement de
signature nécessaire.

Le menu contextuel (long-press sur l'avatar) garde ses deux items existants :
"Voir ma story" (lecture directe, raccourci pour qui veut sauter la liste) et
"Gérer mes stories" (devenu redondant avec le tap simple, mais conservé —
suppression de l'item hors périmètre, ne pas retirer une affordance
découvrable sans le demander explicitement).

Quand l'utilisateur n'a **aucune** story active, le tap continue d'ouvrir le
composer directement (rien à lister) — comportement inchangé.

## 2. Fix — tap sur une ligne ouvre la story concernée

**Bug actuel** : `StoryViewerContainer.postId` (ligne 23) est reçu par le
container mais uniquement utilisé pour déclencher un fetch ciblé
(`viewModel.ensureStoryLoaded(postId:)`, ligne ~201) — jamais converti en
`initialStoryIndex`. Le viewer s'ouvre donc toujours à l'index passé
explicitement (par défaut `0`), quelle que soit la story dont l'id a été
transmis via `postId`. Concrètement : taper la 3ᵉ ligne de `MyStoriesView`
ouvre aujourd'hui la 1ʳᵉ story du groupe, pas la 3ᵉ.

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`

Nouveau helper pur et testable, ajouté dans le même fichier (ou un fichier
`StoryIndexResolver.swift` adjacent si la convention du dossier préfère un
fichier dédié par helper — à trancher au moment du plan) :

```swift
enum StoryIndexResolver {
    /// Résout l'index d'une story par son id dans le groupe fourni.
    /// Retourne `fallback` si `postId` est nil ou absent du groupe.
    static func index(forPostId postId: String?, in group: StoryGroup, fallback: Int) -> Int {
        guard let postId, let idx = group.stories.firstIndex(where: { $0.id == postId }) else {
            return fallback
        }
        return idx
    }
}
```

`StoryViewerContainer.body` (lignes 39-72) calcule l'index résolu une fois
`resolvedIndex` (l'index du groupe) connu, et le passe aux deux branches
(`singleGroup` et non-`singleGroup`) à la place de `initialStoryIndex` brut :

```swift
if let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
    let group = viewModel.storyGroups[resolvedIndex]
    let resolvedStoryIndex = StoryIndexResolver.index(
        forPostId: postId, in: group, fallback: initialStoryIndex)

    if singleGroup {
        StoryViewerView(
            viewModel: viewModel,
            groups: [group],
            currentGroupIndex: 0,
            isPresented: $isPresented,
            initialStoryIndex: resolvedStoryIndex,
            startAtFirstUnviewed: startAtFirstUnviewed,
            initialAction: initialAction
        )
        .transition(.identity)
    } else {
        // idem avec groups: viewModel.storyGroups, currentGroupIndex: resolvedIndex
    }
}
```

**Poursuite de lecture aux autres stories** : déjà couverte par l'existant —
`MyStoriesView` présente toujours avec `singleGroup: true`
(`StoryTrayView.swift` ligne 81), donc `groups` ne contient que le groupe de
l'utilisateur courant. La logique de swipe de `StoryViewerView` avance déjà
dans `group.stories` après la story de départ ; avec l'index de départ
désormais correct, l'utilisateur voit la story tapée puis peut continuer vers
les suivantes de son propre groupe. Aucune modification requise dans
`StoryViewerView` lui-même.

**Effet de bord positif** : ce fix corrige aussi tous les autres points
d'entrée qui transmettent un `postId` sans jamais avoir eu de résolution
d'index (notifications, deep links `storyDetail:`, bookmarks) — même défaut
latent, même fix.

## 3. Créer une story depuis la liste

**Fichiers** : `MyStoriesView.swift`, `StoryTrayView.swift`.

`MyStoriesView` gagne un nouveau paramètre `let onCreateStory: () -> Void`
(même pattern que `onOpen`, délégation au parent qui possède le contexte de
présentation). Toolbar :

```swift
.toolbar {
    ToolbarItem(placement: .navigationBarLeading) {
        Button { onCreateStory() } label: {
            Image(systemName: "plus.circle.fill")
        }
        .accessibilityLabel(String(localized: "story.mine.create", defaultValue: "Créer une story"))
    }
    ToolbarItem(placement: .confirmationAction) {
        Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
    }
}
```

Câblage dans `StoryTrayView.swift` (sheet `MyStoriesView`, ligne ~66-85),
en réutilisant exactement le pattern anti-race déjà en place pour `onOpen`
(fermer la sheet, laisser SwiftUI la dismisser avant de déclencher la
présentation suivante — un `.sheet` et un `.fullScreenCover` actifs
simultanément depuis la même vue hôte se marchent dessus) :

```swift
onCreateStory: {
    showMyStories = false
    Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(350))
        viewModel.showStoryComposer = true
    }
}
```

## 4. Sélection multiple + suppression groupée

**Fichier** : `MyStoriesView.swift`.

Nouvel état local :
```swift
@State private var isSelecting = false
@State private var selectedIDs: Set<String> = []
```

Toolbar trailing, à côté du bouton "OK" existant : bascule "Sélectionner" /
"Annuler" (le second réinitialise `selectedIDs` et repasse `isSelecting` à
`false`).

`MyStoryRow` reçoit deux nouveaux paramètres : `isSelecting: Bool`,
`isSelected: Bool`. En mode sélection, un cercle cochable indigo (style
cohérent avec le design system Meeshy — pas le checkmark bleu système)
s'affiche en tête de ligne, rempli si `isSelected`. Le `.onTapGesture` de la
ligne bascule vers :

```swift
.onTapGesture {
    if isSelecting {
        if selectedIDs.contains(story.id) { selectedIDs.remove(story.id) }
        else { selectedIDs.insert(story.id) }
    } else {
        onOpen(story)
    }
}
```

`.swipeActions` et `.contextMenu` restent attachés mais n'ont d'effet que hors
mode sélection (ou sont explicitement désactivés via un `if !isSelecting`
autour du modifier — à trancher dans le plan selon ce qui reste le plus
lisible).

Barre d'action, visible seulement quand `isSelecting && !selectedIDs.isEmpty` :
```swift
.safeAreaInset(edge: .bottom) {
    if isSelecting && !selectedIDs.isEmpty {
        Button(role: .destructive) {
            bulkDeleteCandidate = true   // ouvre une alert de confirmation
        } label: {
            Text(String(localized: "story.mine.delete.selected",
                        defaultValue: "Supprimer (\(selectedIDs.count))"))
        }
        .buttonStyle(...)  // cohérent avec le style destructif existant du fichier
    }
}
```

Suppression : réutilise la méthode `StoryViewModel.deleteStory(storyId:)`
existante (déjà responsable du DELETE réseau + retrait local + persist cache)
en boucle séquentielle sur `selectedIDs` — pas de nouvelle méthode ViewModel,
le volume attendu (quelques stories, pas des centaines) rend une boucle
`await` simple largement suffisante et évite de dupliquer la logique de retrait
déjà correcte dans `deleteStory`. Un seul toast de synthèse à la fin (succès
total, ou décompte des échecs partiels) plutôt qu'un toast par item.

```swift
private func bulkDelete() {
    Task {
        var failures = 0
        for id in selectedIDs {
            let ok = await viewModel.deleteStory(storyId: id)
            if !ok { failures += 1 }
        }
        await MainActor.run {
            selectedIDs.removeAll()
            isSelecting = false
            if failures == 0 {
                FeedbackToastManager.shared.showSuccess(...)
            } else {
                FeedbackToastManager.shared.showError(...)
            }
        }
    }
}
```

## 5. Vignettes proportionnelles au contenu

**Fichier** : `MyStoriesView.swift`, `MyStoryRow.thumbnail` (lignes 217-233).

`StoryMediaObject.aspectRatio` (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`,
ligne 588 — "figé à la composition", champ requis avec fallback 1.0 sur
anciens brouillons) porte déjà le ratio réel du contenu. Le cadre fixe
`44×64` (ratio ≈0.6875) écrase ce ratio pour toute story qui n'est pas déjà
proche du 9:16.

Nouveau helper pur et testable :
```swift
extension MyStoryRow {
    /// Largeur de vignette pour une hauteur fixe de 64pt, dérivée du ratio
    /// réel du contenu, clampée pour rester lisible en liste.
    static func thumbnailWidth(forAspectRatio aspectRatio: Double?) -> CGFloat {
        let ratio = aspectRatio ?? 0.5625   // fallback 9:16 si absent
        let raw = 64.0 * ratio
        return CGFloat(min(max(raw, 36), 64))
    }
}
```

```swift
private var thumbnail: some View {
    let width = Self.thumbnailWidth(forAspectRatio: story.media.first?.aspectRatio)
    let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
    Group {
        if let urlString = thumbnailURLString, !urlString.isEmpty {
            CachedAsyncImage(url: urlString, targetSize: CGSize(width: width, height: 64)) {
                shape.fill(accentColor.opacity(0.25))
            }
        } else {
            shape.fill(accentColor.opacity(0.25))
                .overlay(Image(systemName: "photo").foregroundColor(accentColor))
        }
    }
    .frame(width: width, height: 64)
    .clipShape(shape)
    .overlay(shape.stroke(accentColor.opacity(0.3), lineWidth: 1))
}
```

La hauteur de ligne reste fixe (64pt) pour ne pas perturber le rythme visuel
de la liste ; seule la largeur varie, dans la plage 36-64pt (portrait extrême
→ carré/paysage plafonné).

## Tests

- `StoryIndexResolverTests` (nouveau, pur, sans mock réseau) : `postId`
  présent au milieu du groupe → bon index ; `postId` absent → fallback ;
  `postId` nil → fallback ; groupe à une seule story.
- Tests sur `MyStoryRow.thumbnailWidth(forAspectRatio:)` : portrait 9:16,
  carré 1:1, paysage extrême (>2.0, doit clamper à 64), `nil` (fallback
  9:16).
- Test comportemental (`MeeshyTests`) : tap sur l'avatar "Ma story" quand une
  story existe déclenche `onManageStories`, pas `onViewMyStory` (mock des
  deux closures, assert call counts).
- Suppression groupée : pas de nouveau test réseau nécessaire —
  `StoryViewModel.deleteStory` est déjà couvert ; le test à ajouter porte sur
  la boucle de `MyStoriesView` (via un test de ViewModel/mock si la boucle est
  extraite en fonction testable, ou test comportemental si elle reste inline
  dans la vue — à trancher au moment du plan selon ce qui est le plus
  testable sans complexifier `MyStoriesView`).

## Risques / points d'attention pour le plan d'implémentation

- Le pattern "fermer la sheet, attendre 350ms, présenter la suite" est déjà
  utilisé deux fois (`onOpen`) ; le dupliquer une 3ᵉ fois pour
  `onCreateStory` est acceptable (3 occurrences, pas encore un signal de
  factorisation obligatoire) mais à surveiller si un 4ᵉ cas apparaît.
- Désactiver `.swipeActions`/`.contextMenu` en mode sélection : vérifier que
  SwiftUI ne laisse pas les deux gestes actifs simultanément (ambiguïté de
  geste possible si mal isolé).
- `StoryIndexResolver` doit chercher dans `group.stories` (ordre de lecture,
  ascendant par `createdAt`), pas dans le tableau trié à l'affichage de
  `MyStoriesView.stories` (ordre inverse, plus récent d'abord) — les deux
  ordres sont différents et ne doivent pas être confondus lors de
  l'implémentation.
