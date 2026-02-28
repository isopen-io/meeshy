# Story Composer Redesign — Design Document

**Date:** 2026-02-28
**Branch:** feat/story-composer-redesign
**Status:** Approved

---

## Goal

Refactor `StoryComposerView` to fix broken tool panel UX, add a multi-slide strip in the top bar, split the Publish button into Play (preview) + Publish (multi-slide), and add draft persistence.

---

## Architecture

**Approach:** Patch Approach A — patch the existing `StoryComposerView` in place. `StoryCanvasView`, `StorySlideManager`, and all tool sub-views (text editor, filter picker, sticker picker, audio panel, voice recorder, transition picker) are preserved unchanged.

**Presentation:** fullscreenCover unchanged.

---

## Layout

```
┌────────────────────────────────────────────────────────┐
│ [✕] │ [■][■][■] ←scroll→ [+Slide] │ [▶][Publish][···] │  ← TOP BAR (fixe)
├────────────────────────────────────────────────────────┤
│                                                        │
│                     CANVAS                             │  ← StoryCanvasView
│           (tap = ferme le panel actif)                 │
│                                                        │
├────────────────────────────────────────────────────────┤
│  [📷][T][😀][✏️][🎨][🎵][✨] ← scrollable             │  ← toolbar outils
├────────────────────────────────────────────────────────┤
│         Panel outil actif (max 200pt, clampé)          │  ← présent ssi tool actif
└────────────────────────────────────────────────────────┘
```

---

## Section 1 — Top Bar

### Composants (gauche → droite)

| Élément | Description |
|---------|-------------|
| `[✕]` | Dismiss le composer. Si des slides ont du contenu → Alert "Quitter sans publier ?" + option "Sauvegarder" |
| `[■][■]…` | Strip scrollable de miniatures de slides (voir Section 2) |
| `[+ Slide]` | Ajoute une slide vierge (copie le fond de la slide active). Désactivé si 10 slides atteint |
| séparateur `│` | Séparateur visuel entre strip et actions |
| `[▶]` | Lance la preview fullscreen (voir Section 4) |
| `[Publish]` | Publie toutes les slides (voir Section 5) |
| `[···]` | Menu contextuel (voir ci-dessous) |

### Menu contextuel `[···]`

- **Sauvegarder le brouillon** — persiste l'état complet dans `UserDefaults`
- **Supprimer tous les slides** — Alert de confirmation
- **Visibilité** — submenu : PUBLIC / FRIENDS / PRIVATE (défaut : PUBLIC)

---

## Section 2 — Strip de slides

### UI

- `ScrollView(.horizontal, showsIndicators: false)` avec `LazyHStack(spacing: 6)`
- Chaque miniature : 48×64pt, `StoryCanvasReaderView(story:)` scalé avec `.scaleEffect(ratio).frame(48, 64).clipped().cornerRadius(6)`
- Slide active : border blanche 2pt + légère ombre
- Slide inactive : opacité 0.7

### Interactions

| Geste | Action |
|-------|--------|
| Tap | Sauvegarde les edits de la slide courante → bascule vers slide tappée |
| Long press | Menu contextuel natif : **Dupliquer** / **Supprimer** |

### Contraintes

- Max 10 slides (limite `StorySlideManager`)
- Supprimer la dernière slide = désactivé si 1 seule slide restante

---

## Section 3 — Système de panneaux d'outils (fix)

### Règles comportementales

1. **Toggle** : taper le bouton d'un outil actif → ferme son panel (`activePanel = .none`). Taper un autre outil → bascule directement (sans passer par `.none`)

2. **Dismiss sur canvas** : quand `activePanel != .none`, un overlay transparent `.onTapGesture { activePanel = .none }` couvre le canvas. La toolbar reste interactive.

3. **Contraintes dimensionnelles** :
   - Container panel : `.frame(maxWidth: UIScreen.main.bounds.width).clipped()`
   - Max height : 200pt
   - Contenu large → `ScrollView(.horizontal)` (déjà en place pour le transition picker)

### Changements de code

- `toolbarButton(icon:label:panel:)` helper : action passe de `activePanel = panel` à `activePanel = (activePanel == panel) ? .none : panel`
- Overlay transparent ajouté sur le canvas dans le `ZStack` principal, conditionnel à `activePanel != .none`
- Chaque `case` du `switch activePanel { }` wrap son contenu dans un container clampé

---

## Section 4 — Preview (▶ Play)

### Flow

1. `StorySlideManager.slides` → map en `[StoryItem]` (conversion locale, zéro API)
2. Présente `StoryViewerView` en fullscreen avec `isPreviewMode: true`, `startIndex: currentSlideIndex`
3. En preview mode :
   - Bouton `✕` en haut à gauche (en plus des contrôles normaux)
   - Fin de la dernière slide → auto-dismiss (`isPresented = false`) + retour composer
   - Tap `✕` → dismiss immédiat + retour composer

### Mapping `StorySlide → StoryItem`

```swift
extension StorySlide {
    func toPreviewStoryItem(author: MeeshyUser) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: mediaURL.map { [FeedMedia(id: id, type: .image, url: $0, ...)] } ?? [],
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Calendar.current.date(byAdding: .hour, value: 21, to: Date()),
            repostOfId: nil,
            isViewed: false,
            translations: nil
        )
    }
}
```

### Modifications StoryViewerView

- Nouveau paramètre `isPreviewMode: Bool` (défaut `false`)
- En preview mode : auto-dismiss quand `currentStoryIndex >= stories.count - 1` et le timer expire
- Bouton `✕` overlay visible ssi `isPreviewMode`

---

## Section 5 — Publication multi-slides

### Flow `publishAllSlides()`

```
Pour chaque slide (ordre 0 → N) :
  1. Si slide a mediaData/mediaURL → compresser + upload TUS → mediaId
  2. AppelAPI : PostService.createStory(content, effects, [mediaId])
  3. Mettre à jour progress : "Publier X/N..."
  4. Si erreur → Alert { Réessayer | Ignorer | Annuler tout }

À la fin → dismiss composer + callback onPublish
```

### UI de progression

- Bouton `Publish` remplacé par `"Publier X/N..."` pendant la publication
- Spinner inline dans le bouton
- Bouton désactivé pendant la publication (sauf via Alert)

### Gestion d'erreur

`Alert` avec 3 options si une slide échoue :
- **Réessayer** → retente la même slide
- **Ignorer** → passe à la suivante (slide ratée perdue)
- **Annuler tout** → arrête la publication, les slides déjà publiées restent

---

## Section 6 — Draft persistence

### Stockage

Clé `UserDefaults` : `"storyComposerDraft"`
Format : JSON encodé de `[StorySlide]` + `visibilityPreference: String`
Limites : mediaData (binaire) exclu du draft — seule l'URL est sauvegardée (si l'image n'est pas encore uploadée, elle ne sera pas restaurée)

### Flow au lancement

```
StoryComposerView.onAppear:
  Si draft trouvé dans UserDefaults →
    Alert "Reprendre votre story ?"
      [Reprendre] → charge les slides du draft dans SlideManager
      [Ignorer]   → supprime le draft, commence vide
```

### Sauvegarde

- Automatique via `[···] → Sauvegarder` (manuelle)
- Draft supprimé après publication réussie ou dismiss via `[✕] → Ne pas sauvegarder`

---

## Fichiers à modifier

| Fichier | Type de changement |
|---------|-------------------|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Refactor principal |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | `publishAllSlides()` |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | Passer `isPreviewMode` |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | Extension `StorySlide.toPreviewStoryItem()` |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | Param `isPreviewMode` + auto-dismiss |

---

## Non-inclus (YAGNI)

- Réorganisation drag-and-drop des slides (peut venir après)
- Batch API côté gateway (prévu si le backend l'expose un jour)
- Preview vidéo des slides (rendu canvas complet — trop lourd pour V1)
- Transitions entre slides dans la preview (StoryViewerView gère déjà ça avec `crossFadeStory`)
