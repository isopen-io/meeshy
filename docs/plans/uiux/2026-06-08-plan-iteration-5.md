# Plan UI/UX — Itération 5 (2026-06-08)

Builds on iterations 1-4. Analysis: `docs/analyses/uiux/2026-06-08-iteration-5.md`.

---

## Objectifs

1. Web accessibility — aria-label sur 6 boutons icône-seulement
2. iOS accessibility — .accessibilityLabel sur 2 boutons dans OnboardingStepViews
3. Web i18n — strings françaises dans composants admin/ui/join
4. Web i18n — groups-layout dark mode gap (RankingFilters bg-white)

---

## Changements prévus

### Web — Accessibilité (6 fichiers)

| Fichier | Bouton | aria-label |
|---------|--------|------------|
| `AgentConversationsTab.tsx:328,335` | Settings + Trash2 | "Edit configuration" / "Delete configuration" |
| `TriggerSchedulingModal.tsx:298` | X cancel schedule | "Cancel schedule" |
| `UserPicker.tsx:51` | Plus add user | "Add user" |
| `ConversationPicker.tsx:120` | X clear | "Clear selection" |
| `AudioEffectsCarousel.tsx:104` | X close | "Close audio effects" |
| `CustomizationManager.tsx:143,211` | Check save + X cancel | "Save" / "Cancel" |

### iOS — Accessibilité (1 fichier)

| Fichier | Ligne | Fix |
|---------|-------|-----|
| `OnboardingStepViews.swift:326` | Skip button (arrow.right.circle) | `.accessibilityLabel(String(localized: "onboarding.skip", defaultValue: "Skip step"))` |
| `OnboardingStepViews.swift:771` | Clear search (xmark.circle.fill) | `.accessibilityLabel(String(localized: "common.clearSearch", defaultValue: "Clear search"))` |

### Web — i18n (7 composants)

| Fichier | Strings | Namespace → clés |
|---------|---------|-----------------|
| `join/AnonymousForm.tsx` | "Ce pseudo est déjà utilisé" / "disponible" | `joinPage.usernameAlreadyTaken` (existe) + add `joinPage.usernameAvailable` |
| `admin/agent/AgentOverviewTab.tsx` | "Aucune activité récente" | `admin.agent.noRecentActivity` |
| `admin/agent/AgentLiveTab.tsx` | "Sélectionnez une conversation…" | `admin.agent.selectConversation` |
| `admin/ranking/RankingFilters.tsx` | 4 French labels/placeholders | `admin.ranking.filters.*` |
| `admin/user-detail/UserLanguageSection.tsx` | "Préférences de Langue" | `admin.agent.languagePreferences` |
| `translation/translation-monitor.tsx` | 3 French headers | `admin.translationMonitor.*` |
| `ui/language-select.tsx` | "Aucune langue trouvée" | `common.noLanguageFound` |

---

## Statut

- [ ] Web aria-labels (6 fichiers)
- [ ] iOS .accessibilityLabel (OnboardingStepViews)
- [ ] locale additions (admin.json × 4, joinPage.json × 1, common.json × 1)
- [ ] AnonymousForm.tsx
- [ ] AgentOverviewTab.tsx
- [ ] AgentLiveTab.tsx
- [ ] RankingFilters.tsx
- [ ] UserLanguageSection.tsx
- [ ] translation-monitor.tsx
- [ ] language-select.tsx
- [ ] Commit + PR + CI
