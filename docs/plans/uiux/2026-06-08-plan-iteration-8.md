# Plan UX — Itération 8 (2026-06-08)

**Branche :** `claude/iter8-uiux-optimization`
**Analyse :** `docs/analyses/uiux/2026-06-08-iteration-8.md`

---

## Changements

### 1. StoryViewModel.swift — Localisation des toast strings

**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`

Remplacer les 4 occurrences hardcodées :

```swift
// Avant
FeedbackToastManager.shared.showSuccess("Story publiee")
FeedbackToastManager.shared.showError("Echec de la publication de la story")

// Après
FeedbackToastManager.shared.showSuccess(String(localized: "story.published", defaultValue: "Story publiée", bundle: .main))
FeedbackToastManager.shared.showError(String(localized: "story.publishError", defaultValue: "Échec de la publication de la story", bundle: .main))
```

Affecte les deux call sites : `publishStory()` (ligne ~490) et `runStoryUpload()` (ligne ~773).

---

### 2. ConversationPreferencesTab.swift — Tokens sémantiques

**Fichier :** `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`

Remplacer les `Color(hex:)` directs avec tokens sémantiques :

- `Color(hex: "F87171")` → `MeeshyColors.error` (×2)
- `Color(hex: "3B82F6")` → `MeeshyColors.info` (×6 dans la section organisation)
- `Color(hex: "FF6B6B")` → `MeeshyColors.error` (×2 tints toggles notifications)
- `Color(hex: "F59E0B")` → `MeeshyColors.warning` (×1 bouton archive)

---

### 3. admin/users/new/page.tsx — Dark mode

**Fichier :** `apps/web/app/admin/users/new/page.tsx`

```tsx
// Titre (ligne 134)
className="text-2xl font-bold text-gray-900 dark:text-gray-100"

// Sous-titre (ligne 135)
className="text-sm text-gray-600 dark:text-gray-400"

// Selects (lignes 331, 347, 370)
className="w-full p-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
```

---

## Checklist

- [x] StoryViewModel.swift — 4 toast strings localisées
- [x] ConversationPreferencesTab.swift — 12 Color(hex:) remplacés par tokens sémantiques
- [x] admin/users/new/page.tsx — dark mode gaps corrigés
- [ ] Commit + push vers `claude/iter8-uiux-optimization`
- [ ] CI verte
- [ ] Merge dans main
