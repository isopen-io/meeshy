# UI/UX Plan — Iteration 10 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-10.md`.

## Fixes

### [I1] ReportUserView — English defaultValues
File: `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`

| Key | French → English |
|-----|-----------------|
| `report.user.title` | "Signaler" → "Report" |
| `common.close` | "Fermer" → "Close" |
| `report.user.reason` | "Raison du signalement" → "Report reason" |
| `common.selected` | "selectionne" → "Selected" |
| `report.user.details` | "Details (optionnel)" → "Details (optional)" |
| `report.user.details.a11y` | "Details du signalement" → "Report details" |
| `report.user.submit` (×2) | "Envoyer le signalement" → "Send report" |
| `report.user.submit.hint` | "Envoie le signalement pour" → "Send report for" |
| `report.user.success` | "Signalement envoye" → "Report sent" |
| `report.user.error` | "Erreur lors de l'envoi du signalement" → "Error sending report" |
| `report.user.reason.harassment` | "Harcelement" → "Harassment" |
| `report.user.reason.inappropriate` | "Contenu inapproprie" → "Inappropriate content" |
| `report.user.reason.impersonation` | "Usurpation d'identite" → "Impersonation" |

### [I2] OnboardingStepViews — MeeshyColors migration
File: `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`

replace_all patterns:
1. `.foregroundColor(available ? .green : .red)` → `…MeeshyColors.success : MeeshyColors.error)`
2. `.foregroundColor(.green)` → `.foregroundColor(MeeshyColors.success)`
3. `.foregroundColor(.red)` → `.foregroundColor(MeeshyColors.error)`
4. `Color.red.opacity(` → `MeeshyColors.error.opacity(`
5. `.foregroundColor(passwordsMatch ? .green : .red)` → `…MeeshyColors.success : MeeshyColors.error)`
6. `(passwordsMatch ? Color.green : Color.red).opacity(0.1)` → unique replacement
7. `.foregroundColor(met ? .green : .secondary)` → unique
8. `case .weak: return .red` / `case .strong: return .green` → unique
9. `viewModel.bio.count > 150 ? .red` → unique
10. `Color.green` in terms checkbox → unique (stroke + fill)
11. `.accessibilityHidden(true)` on StepIllustration ZStack

### [I3] FloatingCallPillView — "Inconnu" → "Unknown"
File: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`
- Line 106: `defaultValue: "Inconnu"` → `defaultValue: "Unknown"`

### [W1] ConversationList — Skeleton ARIA
File: `apps/web/components/conversations/ConversationList.tsx`
- Outer div: add `role="status" aria-busy="true" aria-label={t('loadingConversations')}`
- Each skeleton row: add `aria-hidden="true"`

## Checklist

- [ ] I1 — ReportUserView 14 French defaults → English
- [ ] I2 — OnboardingStepViews MeeshyColors (all patterns)
- [ ] I3 — FloatingCallPillView "Inconnu" → "Unknown"
- [ ] W1 — ConversationList skeleton ARIA
- [ ] Commit on `claude/dazzling-hawking-FeZgq`
- [ ] Push & CI green
- [ ] Merge into main
