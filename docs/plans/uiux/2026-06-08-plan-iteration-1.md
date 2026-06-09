# Plan UI/UX — Itération 1 (2026-06-08)

## Objectif

Corriger les issues critiques et moyennes identifiées dans l'analyse `2026-06-08-iteration-1.md`.
Chaque correction est atomique, testable, sans régression sur les autres features.

## Changements iOS

### 1. ReportUserView.swift — Couleurs MeeshyColors

Remplacer toutes les occurrences de `Color(hex: "EF4444")` par `MeeshyColors.error` et `Color(hex: "6B7280")` par `MeeshyColors.neutral500`. Supprimer la constante privée `accentColor`.

Fichier : `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`

### 2. FloatingCallPillView.swift — Dynamic Type + A11y

- `.system(size: 14, weight: .semibold, design: .rounded)` → `.subheadline.weight(.semibold)`
- `.system(size: 12, weight: .medium).monospacedDigit()` → `.caption.weight(.medium).monospacedDigit()`
- Accessibilité mute button : wraper dans `String(localized: "call.pill.mute" / "call.pill.unmute")`
- Accessibilité speaker button : wraper dans `String(localized: "call.pill.speaker.on" / "call.pill.speaker.off")`

Fichier : `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`

### 3. ConversationView.swift — Long-press delay

`0.25` → `0.05` secondes.

Fichier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` ligne 807

## Changements Web

### 4. Header.tsx — "Guest" hardcodé

Ligne 144 : `"Guest"` → `{t('guest')}` (clé existe déjà dans `locales/*/header.json`)
Ligne 109 : `text-blue-600` → `text-primary`
Ligne 110 : `text-gray-900 dark:text-white` → `text-foreground`
Ligne 329 : aria-labels menu mobile → utiliser `t('openMenu')` / `t('closeMenu')` + ajouter clés

Fichier : `apps/web/components/layout/Header.tsx`

### 5. ErrorBoundary.tsx — I18n

Extraire l'UI d'erreur vers un composant fonctionnel `ErrorDisplay` qui utilise `useI18n('common')`.
Ajouter clés `errorBoundary.*` dans tous les fichiers locales.

Fichier : `apps/web/components/common/ErrorBoundary.tsx`
Fichiers locales : `apps/web/locales/{en,fr,es,pt}/common.json`

### 6. clipboard.ts — Messages i18n

Ajouter paramètre optionnel `messages?: ClipboardMessages` à `copyToClipboard`.
Fallback vers les strings actuelles si non fourni.

Fichier : `apps/web/lib/clipboard.ts`

## Statut

- [x] Analyse créée
- [x] Plan créé
- [ ] iOS: ReportUserView couleurs
- [ ] iOS: FloatingCallPillView Dynamic Type + a11y
- [ ] iOS: ConversationView long-press delay
- [ ] Web: Header.tsx Guest + couleurs + aria
- [ ] Web: ErrorBoundary i18n
- [ ] Web: clipboard.ts messages
- [ ] Commit + push
- [ ] CI pass
- [ ] Merge dans main
