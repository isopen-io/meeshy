# Plan UI/UX — Itération 6 (2026-06-08)

## Objectif

Corriger les violations Dynamic Type (PostDetailView + ThreadView), migrer la couleur amethyst
vers MeeshyColors.indigo600, ajouter accessibilityLabel aux media grids, corriger i18n "Inconnu",
et corriger le dark mode de l'admin (AdminLayout + NotFoundPage).

## Changements iOS

### 1. UniversalComposerBar+Attachments.swift — amethyst → indigo600
- Line 106: `color: "9B59B6"` → `color: "4F46E5"`
- Line 217: `Color(hex: "9B59B6")` → `MeeshyColors.indigo600`
- Line 231: `Color(hex: "9B59B6")` → `MeeshyColors.indigo600`
- Line 253: `Color(hex: "9B59B6").opacity(0.3)` → `MeeshyColors.indigo600.opacity(0.3)`

### 2. FeedPostCard+Media.swift — accessibilityLabel sur tap gestures
Ajouter après chaque `.onTapGesture { openFullscreen(...) }` :
```swift
.accessibilityLabel(String(localized: "feed.post.media.view", defaultValue: "View media", bundle: .main))
.accessibilityAddTraits(.isButton)
```
15 occurrences (lines 24, 27, 37, 42, 45, 56, 59, 64, 67, 78, 81, 86, 89, 100, 225).

### 3. ThreadView.swift — Dynamic Type + i18n
Dynamic Type (replace `.system(size: X)` → semantic fonts) :
- Line 55: `.headline`
- Line 61: `.caption.weight(.medium)`
- Line 95: `.subheadline.weight(.semibold)`
- Line 99: `.caption2`
- Line 107: `.subheadline`
- Line 128: `.caption2.weight(.bold)`
- Line 159: `.caption.weight(.semibold)`
- Line 163: `.caption2`
- Line 168: `.callout`
- Line 183: `.caption2`
- Line 194: `.callout`

i18n :
- Line 94: `"Inconnu"` → `String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main)`
- Line 158: `"Inconnu"` → `String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main)`

### 4. PostDetailView.swift — Dynamic Type (HIGH severity)
- Line 670: `.subheadline.weight(.bold)` (author name)
- Lines 725, 732, 739: `.callout` (post content)
- Lines 728, 735: `.callout.weight(.semibold)` (see more/less)

## Changements Web

### 5. AdminLayout.tsx — dark mode sidebar + header
- Line 200: `text-gray-900 dark:text-gray-100`
- Line 201: `text-gray-500 dark:text-gray-400`
- Line 239: `text-gray-900 dark:text-gray-100`
- Line 306: `bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700`
- Line 320: `text-gray-900 dark:text-gray-100`
- Line 333: `text-gray-500 dark:text-gray-400`

### 6. not-found-page.tsx — dark mode
- Line 26: `bg-gray-50 dark:bg-gray-900`
- Line 32: `text-gray-900 dark:text-gray-100`
- Line 37: `text-gray-600 dark:text-gray-400`
- Line 61: `text-gray-500 dark:text-gray-400`
- Line 64: `text-gray-600 dark:text-gray-400`

## Statut

- [x] Analyse créée
- [x] Plan créé
- [x] UniversalComposerBar+Attachments amethyst → indigo
- [x] FeedPostCard+Media accessibilityLabel
- [x] ThreadView Dynamic Type + i18n
- [x] PostDetailView Dynamic Type
- [x] AdminLayout dark mode
- [x] not-found-page dark mode
- [ ] Commit + push
- [ ] CI pass
- [ ] Merge dans main
