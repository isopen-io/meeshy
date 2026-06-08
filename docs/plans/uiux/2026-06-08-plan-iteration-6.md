# UI/UX Plan — Iteration 6 (2026-06-08)

## Objectives

1. **Web i18n**: Wire existing + add missing locale keys in 7 components
2. **Web a11y**: Add `aria-label` to 8 icon-only buttons across 6 files
3. **iOS a11y**: Add `accessibilityLabel` to 4 interactive elements across 2 files
4. **iOS Dynamic Type**: Migrate 76 fixed-size fonts across PostDetailView, ThreadView, ReplyThreadOverlay

Two agents run in parallel: Web (i18n + a11y) and iOS (a11y + Dynamic Type).

---

## Passe A — Web

### Step 1 — Add missing locale keys

**joinPage.json** (×4 languages en/fr/es/pt):
```json
"usernameAvailable": "Username available"
```
FR: `"Ce pseudo est disponible"` / ES: `"Nombre de usuario disponible"` / PT: `"Nome de usuário disponível"`

**admin.json** (×4 languages) — add to existing sections:
```json
{
  "agentLive": {
    "selectConversation": "Select a conversation to monitor its state in real time"
  },
  "ranking": {
    "selectEntity": "Select entity type",
    "selectCriterion": "Select criterion",
    "selectPeriod": "Select period"
  },
  "userDetail": {
    "languagePreferences": "Language Preferences"
  },
  "translationMonitor": {
    "loadingMetrics": "Loading metrics...",
    "languageBreakdown": "Language breakdown"
  }
}
```

**components.json** (×4 languages) — add to `components` section:
```json
{
  "languageSelect": {
    "notFound": "No language found"
  }
}
```

### Step 2 — Wire i18n in components

**AnonymousForm.tsx** (hook already present: `useI18n('joinPage')`):
- L116: `"Ce pseudo est déjà utilisé"` → `t('joinPage.usernameAlreadyTaken')`
- L154: same
- L157: `"Ce pseudo est disponible"` → `t('joinPage.usernameAvailable')`

**groups-layout-responsive.tsx** (hook already present: `useI18n('groups')` → `tGroups`):
- L402: `"Aucune communauté"` → `tGroups('groups.noGroups')`
- L403: `"Créez-en une pour commencer"` → `tGroups('groups.noGroupsDescription')`
- L576: `"Créée le {date}"` → `` `${tGroups('groups.details.createdOn')} ${new Date(...).toLocaleDateString()}` ``
- L590: `"Sélectionnez une communauté"` → `tGroups('groups.list.selectCommunity')`
- L592: `"Choisissez une communauté..."` → `tGroups('groups.list.selectCommunityDescription')`

**AgentLiveTab.tsx** (add hook):
- Add: `import { useI18n } from '@/hooks/useI18n'`
- Add: `const { t } = useI18n('admin')` in component
- L451: hardcoded string → `t('admin.agentLive.selectConversation')`

**RankingFilters.tsx** (add hook):
- Add: `import { useI18n } from '@/hooks/useI18n'`
- Add: `const { t } = useI18n('admin')` in component
- L69 entity placeholder → `t('admin.ranking.selectEntity')`
- L106 criterion placeholder → `t('admin.ranking.selectCriterion')`
- L151 period placeholder → `t('admin.ranking.selectPeriod')`

**UserLanguageSection.tsx** (add hook):
- Add: `import { useI18n } from '@/hooks/useI18n'`
- Add: `const { t } = useI18n('admin')` in component
- L96: `"Préférences de Langue"` → `t('admin.userDetail.languagePreferences')`

**translation-monitor.tsx** (add hook):
- Add: `import { useI18n } from '@/hooks/useI18n'`
- Add: `const { t } = useI18n('admin')` in component
- L156: `"Chargement des métriques..."` → `t('admin.translationMonitor.loadingMetrics')`
- L270: `"Répartition par langue"` → `t('admin.translationMonitor.languageBreakdown')`

**language-select.tsx** (add hook):
- Add: `import { useI18n } from '@/hooks/useI18n'`
- Add: `const { t } = useI18n('components')` in component
- L103: `"Aucune langue trouvée"` → `t('components.languageSelect.notFound')`

### Step 3 — Web a11y fixes

Add `aria-label` attributes (using hardcoded English — these are dev-tool labels):

- `AgentConversationsTab.tsx:328` Settings button → `aria-label="Edit agent configuration"`
- `AgentConversationsTab.tsx:335` Trash2 button → `aria-label="Delete configuration"`
- `TriggerSchedulingModal.tsx:298` X button → `aria-label="Cancel scheduled trigger"`
- `UserPicker.tsx:51` Plus button → `aria-label="Add user"`
- `ConversationPicker.tsx:120` X button → `aria-label="Clear selection"`
- `AudioEffectsCarousel.tsx:104` X button → `aria-label="Close audio effects"`
- `CustomizationManager.tsx:143` X button → `aria-label="Cancel editing name"`
- `CustomizationManager.tsx:211` X button → `aria-label="Cancel editing reaction"`

---

## Passe B — iOS

### Step 1 — iOS a11y fixes (OnboardingStepViews.swift + MagicLinkView.swift)

**OnboardingStepViews.swift:43** (eye/eye.slash toggle):
```swift
.accessibilityLabel(String(localized: "onboarding.password.toggleVisibility",
                            defaultValue: "Toggle password visibility", bundle: .main))
```

**OnboardingStepViews.swift:326** (skip button):
```swift
.accessibilityLabel(String(localized: "onboarding.skipStep",
                            defaultValue: "Skip step", bundle: .main))
```

**OnboardingStepViews.swift:771** (clear search):
```swift
.accessibilityLabel(String(localized: "onboarding.clearSearch",
                            defaultValue: "Clear search", bundle: .main))
```

**MagicLinkView.swift:236** (retry/resend button):
```swift
.accessibilityLabel(String(localized: "auth.magiclink.resendLabel",
                            defaultValue: "Resend magic link", bundle: .main))
```

### Step 2 — iOS Dynamic Type

Apply semantic font mapping to all fixed `.font(.system(size:` instances in:
- `PostDetailView.swift` (48 instances)
- `ThreadView.swift` (13 instances)
- `ReplyThreadOverlay.swift` (15 instances)

Mapping:
| Size | Semantic font |
|------|--------------|
| 10–11pt | `.caption2` |
| 12pt | `.caption` |
| 13pt | `.footnote` |
| 14–15pt | `.subheadline` |
| 16pt | `.callout` |
| 17pt | `.body` |
| 18–20pt | `.headline` |
| 24pt+ decorative | Keep `.system(size:)` with `.minimumScaleFactor(0.7)` |
| Bold weight | Preserve via `.font(.semantic.weight(.bold))` or `.bold()` |

---

## Commit & CI

- Web commit: `uiux(iter-6/web): i18n (7 components) + a11y (8 icon buttons)`
- iOS commit: `uiux(iter-6/ios): a11y (OnboardingStepViews + MagicLink) + Dynamic Type (PostDetailView + ThreadView + ReplyThreadOverlay)`
- Push → CI → merge to main → start iteration 7
