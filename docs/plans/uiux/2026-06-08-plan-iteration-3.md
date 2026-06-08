# Plan UI/UX — Itération 3 (2026-06-08)

> Base : iter-2 mergé (PR #346). Branche : `claude/dazzling-hawking-G4rlq`

## Objectif
Corriger les 11 problèmes HIGH/CRITIQUE identifiés dans l'analyse iter-3 sur les deux frontends.

## Checklist

### Web
- [x] W1 `PermissionRequest.tsx` — i18n complet (permission.* section dans calls.json × 4 langues)
- [x] W2 `PushPermissionBanner.tsx` — i18n (pushPermission.* dans notifications.json × 4 langues)
- [x] W3–W5 `notification-settings.tsx` — i18n toasts + `window.confirm` → AlertDialog
- [x] W6 `message-composer/index.tsx` — default locale `'fr-FR'` → `'en'`

### iOS
- [x] I1 `ContextActionMenu.swift` — 7 labels long-press → `String(localized:defaultValue:bundle:)`
- [x] I2 `Router.swift` — 22 titres navigation → `String(localized:defaultValue:bundle:)`
- [x] I3–I4 `BubbleFooter.swift` — 6 labels a11y → `String(localized:defaultValue:bundle:)`
- [x] I5 `RootViewComponents.swift` — 3 strings feed menu → `String(localized:defaultValue:bundle:)`
- [x] I6 `AboutView.swift` — `Color(hex: "4ADE80")` → `MeeshyColors.success`

## Fichiers modifiés

### Locales web (12 fichiers)
- `locales/{en,fr,es,pt}/calls.json` — section `permission.*`
- `locales/{en,fr,es,pt}/notifications.json` — section `pushPermission.*`
- `locales/{en,fr,es,pt}/settings.json` — section `settings.notifications.*` enrichie

### Composants web (4 fichiers)
- `components/video-calls/PermissionRequest.tsx`
- `components/notifications/PushPermissionBanner.tsx`
- `components/settings/notification-settings.tsx`
- `components/common/message-composer/index.tsx`

### iOS (5 fichiers)
- `Features/Main/Views/ContextActionMenu.swift`
- `Features/Main/Navigation/Router.swift`
- `Features/Main/Views/Bubble/BubbleFooter.swift`
- `Features/Main/Views/RootViewComponents.swift`
- `Features/Main/Views/AboutView.swift`

## Qualité
- TypeScript : 0 erreur (warning préexistant `downlevelIteration` ignoré)
- iOS build : à valider via CI

## Itération 4 — Backlog
- [ ] `DataStorageView.swift`, `ThreadView.swift`, `DataExportView.swift` — migration hex → MeeshyColors
- [ ] `MediaDownloadSettingsView.swift` — couleurs settings hardcodées
- [ ] `TextBubbleCell.swift` — UIColor(hex:) → sémantique dark mode
- [ ] `OnboardingStepViews.swift` — decorative text `.accessibilityHidden(true)`
- [ ] Web `ContactStep.tsx` — `focus:outline-none focus:ring-0` → `focus-visible:`
- [ ] Web `CommentItem.tsx`, `PostCard.tsx` — strings EN hardcodées dans feed
- [ ] Création locales de/it (6 → 8 langues UI)
