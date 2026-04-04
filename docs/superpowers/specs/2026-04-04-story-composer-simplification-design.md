# Story Composer Simplification + Status Republication

## Objectif

1. Simplifier la toolbar du Story Composer : remplacer les 3 labels texte minuscules (FOND/FRONT/PLUS) par un toggle segmente pleine largeur FOND/FRONT
2. Integrer les outils PLUS (Filtre, Effets) contextuellement par element selectionne
3. Commenter les fonctionnalites non fonctionnelles (audio ambiance)
4. Corriger la republication de status : doit rester un STATUS (pas un POST), avec "via @username"

## Problemes actuels

1. **ContextualToolbar** : 3 labels texte 11pt quasi invisibles ("FOND", "FRONT", "PLUS"), tap-to-expand confus
2. **Audio ambiance** (bgAudio) : non fonctionnel — outil present mais ne produit rien
3. **reshareStory()** : appelle `/posts/{id}/repost` qui cree un POST generique, pas un STATUS
4. **Groupe PLUS** : Filtre/Effets/Timeline isoles dans un panel dedie — devrait etre contextuel par element

## Design

### 1. Toolbar — Toggle FOND <-> FRONT

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift`

Remplacer le `ContextualToolbar` actuel par :

```
┌─────────────────────────────────────┐
│         [  FOND  |  FRONT  ]        │  toggle segmente, .ultraThinMaterial
│                                     │
│  ┌─────┐ ┌─────┐                    │  outils du mode actif (toujours visibles)
│  │ 📷  │ │ ✏️  │                    │
│  │Fond │ │Dessin│                   │
│  └─────┘ └─────┘                    │
└─────────────────────────────────────┘
```

- **Toggle** : 2 segments (FOND / FRONT), 44pt hauteur, segment actif = `brandGradient`
- **Mode FOND** : bgMedia (Fond), drawing (Dessin) — toujours visibles, pas de tap-to-expand
- **Mode FRONT** : text (Texte), media (Media), audio (Audio) — toujours visibles
- **Audio ambiance supprime** du FOND (commente)
- **Groupe PLUS supprime** comme panel — outils integres contextuellement

### 2. Menu contextuel par element

**Fichier** : `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift`

Quand un element est selectionne sur le canvas :
- Mini-menu contextuel flottant au-dessus de l'element
- Options selon le type d'element :
  - Image/Video : Filtre, Effets, Supprimer
  - Texte : Effets, Supprimer
  - Audio : Effets, Supprimer
- Timeline accessible via long press sur zone vide du canvas

### 3. Fonctionnalites desactivees

Commenter avec `// DISABLED: <raison>` :
- `bgAudio` dans StoryToolMode et ContextualToolbar — non fonctionnel
- Groupe `StoryToolGroup.plus` — remplace par contextuel
- Outils `.filter`, `.effects`, `.timeline` dans la toolbar — deplacees en contextuel

### 4. Republication de status

#### 4a. Flow utilisateur

1. L'utilisateur voit un status d'un ami (StatusBarView ou StatusBubbleOverlay)
2. Tap "Partager" → ouvre `StatusComposerView` pre-rempli :
   - Emoji pre-selectionne
   - Texte pre-rempli
   - Source username stocke en local
3. L'utilisateur peut modifier emoji/texte
4. Tap "Publier" → cree un nouveau STATUS avec `viaUsername`

#### 4b. Modifications StatusComposerView

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`

Ajouter des parametres optionnels au init :
- `initialEmoji: String? = nil`
- `initialText: String? = nil`
- `viaUsername: String? = nil`

Si `viaUsername` est present, afficher "Republier le status de @username" dans le header.

#### 4c. Modifications StatusViewModel / StatusService

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`

`setStatus()` accepte un parametre optionnel `viaUsername: String?`

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift`

`create()` passe `viaUsername` dans le body si present. Le backend stocke cette info.

#### 4d. Modifications reshareStory → reshareStatus

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

`reshareStory()` pour les status :
- Au lieu d'appeler `/posts/{id}/repost`
- Ouvrir le StatusComposerView pre-rempli avec emoji/texte/viaUsername du status original

#### 4e. Affichage "via @username"

**Fichiers** : `StatusBarView.swift`, `StatusBubbleOverlay.swift`

Sous le texte du status, en petit discret :
```
via @sarah
```
Style : `.font(.system(size: 11))`, `.foregroundColor(theme.textMuted)`

## Fichiers concernes

| Fichier | Action |
|---------|--------|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/ContextualToolbar.swift` | Reecriture → toggle FOND/FRONT |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Supprimer .plus, commenter bgAudio |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | Adapter bottom overlay |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift` | Menu contextuel par element |
| `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` | Params initiaux + viaUsername |
| `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift` | viaUsername dans setStatus() |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift` | viaUsername dans create() |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | reshareStory → StatusComposer |
| `apps/ios/Meeshy/Features/Main/Views/StatusBarView.swift` | Afficher "via @username" |
| `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift` | Afficher "via @username" |

## Hors scope

- Backend : ajout du champ `viaUsername` dans le modele Post/Status (necessite changement API)
- Timeline comme outil global (long press canvas — futur)
- Audio ambiance refactoring (desactive pour l'instant)
