# UI/UX Plan — Iteration 3 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-3.md`.

## Fixes

### [I1] FloatingCallPillView — English defaultValues
File: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`

| Key | Old defaultValue | New defaultValue |
|-----|-----------------|-----------------|
| `call.pill.ongoing` | "Appel en cours" | "Ongoing call" |
| `call.pill.tapToReturn` | "Touchez pour revenir à l'appel en plein écran" | "Tap to return to full-screen call" |
| `call.pill.unknown` | "Inconnu" | "Unknown" |
| `call.pill.unmute` | "Réactiver le micro" | "Unmute microphone" |
| `call.pill.mute` | "Couper le micro" | "Mute microphone" |
| `call.pill.speaker.off` | "Désactiver le haut-parleur" | "Disable speaker" |
| `call.pill.speaker.on` | "Activer le haut-parleur" | "Enable speaker" |
| `call.pill.expand` | "Agrandir l'appel" | "Expand call" |
| `call.pill.hangup` | "Raccrocher" | "Hang up" |

### [I2] ReportUserView — English defaultValues
File: `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`

| Key | Old defaultValue | New defaultValue |
|-----|-----------------|-----------------|
| `report.user.title` | "Signaler" | "Report" |
| `common.close` | "Fermer" | "Close" |
| `report.user.reason` | "Raison du signalement" | "Report reason" |
| `report.user.details` | "Details (optionnel)" | "Details (optional)" |
| `common.selected` | "selectionne" | "Selected" |
| `report.user.submit` | "Envoyer le signalement" | "Send report" |
| `report.user.submit.hint` | "Envoie le signalement pour" | "Send report for" |
| `report.user.details.a11y` | "Details du signalement" | "Report details" |
| `report.user.success` | "Signalement envoye" | "Report sent" |
| `report.user.error` | "Erreur lors de l'envoi du signalement" | "Error sending report" |
| `report.user.reason.harassment` | "Harcelement" | "Harassment" |
| `report.user.reason.inappropriate` | "Contenu inapproprie" | "Inappropriate content" |
| `report.user.reason.impersonation` | "Usurpation d'identite" | "Impersonation" |

### [I3] OnboardingStepViews — MeeshyColors migration
File: `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

Replace all SwiftUI system colors with semantic design tokens:
- `.green` / `Color.green` → `MeeshyColors.success`
- `.red` / `Color.red` → `MeeshyColors.error`

Affected patterns (replace_all where identical):
1. `.foregroundColor(available ? .green : .red)` — 2 occurrences
2. `.foregroundColor(.green)` — 5 occurrences (tipRow, checkmark, lock icon, email tip)
3. `.foregroundColor(.red)` — 4 occurrences (error messages, error view)
4. `Color.red.opacity(0.5)` — 2 occurrences (border stroke)
5. `.foregroundColor(passwordsMatch ? .green : .red)` — 2 occurrences
6. `(passwordsMatch ? Color.green : Color.red).opacity(0.1)` — 1 occurrence
7. `.foregroundColor(met ? .green : .secondary)` — 1 occurrence (reqRow)
8. `PasswordStrength.color`: `.weak: return .red` and `.strong: return .green`
9. `.foregroundColor(viewModel.bio.count > 150 ? .red : .secondary)` — 1 occurrence
10. Terms checkbox: `Color.green` stroke and fill — 2 occurrences

### [I4] StepIllustration — Accessibility hidden
File: `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

Add `.accessibilityHidden(true)` to the `ZStack` body of `StepIllustration`.

### [W1] ConversationList — Skeleton ARIA
File: `apps/web/components/conversations/ConversationList.tsx`

```tsx
// Before
<div className="flex flex-col gap-1 p-2">
  {Array.from({ length: 8 }).map((_, i) => (
    <div key={i} className="... animate-pulse">

// After
<div role="status" aria-busy="true" aria-label={t('loadingConversations')} className="flex flex-col gap-1 p-2">
  {Array.from({ length: 8 }).map((_, i) => (
    <div key={i} aria-hidden="true" className="... animate-pulse">
```

### [W2] ConversationEmptyState — Dark mode border
File: `apps/web/components/conversations/ConversationEmptyState.tsx`

```tsx
// Before
border-primary/20 dark:border-primary/30

// After
border-primary/30 dark:border-primary/50
```

## Checklist

- [ ] I1 — FloatingCallPillView defaultValues → English
- [ ] I2 — ReportUserView defaultValues → English
- [ ] I3 — OnboardingStepViews MeeshyColors migration (all 10 patterns)
- [ ] I4 — StepIllustration .accessibilityHidden(true)
- [ ] W1 — ConversationList skeleton ARIA attributes
- [ ] W2 — ConversationEmptyState dark border contrast
- [ ] Commit on `claude/dazzling-hawking-FeZgq`
- [ ] Push & CI green
- [ ] Merge into main
