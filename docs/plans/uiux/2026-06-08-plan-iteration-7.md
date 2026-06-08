# UI/UX Plan — Iteration 7 (2026-06-08)

## Objectives

1. **Fix key-path bugs**: 5 broken `t()` calls using wrong namespace prefix
2. **Complete RankingFilters i18n**: Wire 13+ French strings + PERIODS array
3. **Complete UserLanguageSection i18n**: Wire 14+ French strings + toast
4. **Complete translation-monitor i18n**: Wire 9 French strings
5. **Complete AgentLiveTab i18n**: Wire 15+ French strings across 6 sub-components
6. **Fix groups-layout**: Fix 5 wrong-prefix tGroups() calls + wire 7 remaining strings
7. **Complete language-select i18n**: Wire 2 French defaults
8. **iOS Dynamic Type**: Fix 3 remaining fixed fonts in PostDetailView.swift

---

## Step 1 — Update admin.json (×4 languages: en/fr/es/pt)

Add to existing `ranking` section:
```json
"filtersTitle": "Ranking filters",
"entityType": "Entity type",
"entityUsers": "Users",
"entityConversations": "Conversations",
"entityMessages": "Messages",
"entityLinks": "Links",
"criterion": "Criterion",
"filterCriteria": "Filter criteria...",
"noCriteriaFound": "No criteria found",
"period": "Period",
"resultsCount": "Number of results",
"period1d": "Last day (24h)",
"period7d": "Last week (7d)",
"period30d": "Last month (30d)",
"period90d": "Last quarter (90d)",
"period180d": "Last semester (180d)",
"period365d": "Last year (365d)",
"periodAll": "All time"
```

Add to `agentLive`:
```json
"conversationsActive": "Active conversations",
"loading": "Loading...",
"monitoredUsers": "Monitored users",
"noMonitoredUsers": "No monitored users",
"toneProfiles": "Tone profiles",
"noToneProfiles": "No tone profiles",
"contextualSummary": "Contextual summary",
"topics": "Topics",
"tone": "Tone:",
"noSummary": "No summary available",
"metrics": "Metrics",
"messages": "Messages",
"words": "Words",
"confidence": "Confidence",
"cachedMessages": "cached messages",
"noAnalytics": "No analytics available",
"loadError": "Unable to load live state",
"connectionError": "Connection error or conversation not found"
```

Add to `userDetail`:
```json
"edit": "Edit",
"cancel": "Cancel",
"save": "Save",
"saving": "Saving...",
"systemLanguage": "System language",
"systemLanguageHint": "Main interface language",
"regionalLanguage": "Regional language",
"regionalLanguageHint": "Secondary language for regional content",
"customDestination": "Custom destination language",
"customDestinationHint": "Destination language for custom translation",
"systemLanguageLabel": "System language:",
"regionalLanguageLabel": "Regional language:",
"destinationLabel": "Destination language:",
"none": "None",
"updateSuccess": "Language preferences updated"
```

Add to `translationMonitor`:
```json
"title": "Translation Monitor",
"messages": "Messages",
"pending": "Pending",
"errors": "Errors",
"progressLabel": "Translation progress",
"errorMonitoring": "Monitoring error",
"realTimeActivity": "Real-time activity",
"activeTranslations": "Active translations",
"queue": "Queue"
```

## Step 2 — Update components.json (×4 languages: en/fr/es/pt)

Add to `languageSelect`:
```json
"placeholder": "Select a language",
"searchPlaceholder": "Search a language..."
```

## Step 3 — Fix and wire RankingFilters.tsx

- Fix `t('admin.ranking.selectX')` → `t('ranking.selectX')`
- Replace PERIODS array with locale-driven periods using `t('ranking.periodXxx')`
- Wire remaining French labels

## Step 4 — Wire UserLanguageSection.tsx

Wire all 14+ French strings to `t('userDetail.xxx')` calls.

## Step 5 — Wire translation-monitor.tsx

Wire 9 French strings to `t('translationMonitor.xxx')` calls.

## Step 6 — Fix and wire AgentLiveTab.tsx

- Fix `t('admin.agentLive.selectConversation')` → `t('agentLive.selectConversation')`
- Add `const { t } = useI18n('admin')` to: `RecentConversationsList`, `ActivityCard`,
  `ToneProfilesCard`, `SummaryCard`, `MetricsCard`
- Refactor `formatTimeAgo` to accept `t` function as parameter
- Wire all French strings

## Step 7 — Fix groups-layout-responsive.tsx

- Fix 5 wrong-prefix `tGroups('groups.xxx')` → `tGroups('xxx')`
- Wire 7 remaining hardcoded French strings

## Step 8 — Wire language-select.tsx

- Fix `t('components.languageSelect.notFound')` → `t('languageSelect.notFound')`
- Wire `placeholder` and `searchPlaceholder` from locale

## Step 9 — iOS PostDetailView.swift

Fix 3 remaining `.font(.system(size:` calls to semantic fonts.

---

## Commit & Push

- Commit: `uiux(iter-7): fix i18n key-path bugs + complete French string wiring (6 web components)`
- Commit: `uiux(iter-7/ios): fix 3 remaining fixed fonts in PostDetailView`
- Push → CI → merge to main
