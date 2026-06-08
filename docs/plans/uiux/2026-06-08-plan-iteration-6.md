# UI/UX Plan — Iteration 6 (2026-06-08)

## Scope
Groups layout i18n + ConversationInfoSheet iOS color migration.

## Web: groups-layout-responsive.tsx — 12 hardcoded French strings

All target keys already exist in `locales/{en,fr,es,pt}/groups.json`.
Component already imports `useI18n` and uses `tGroups = t('groups')`.
No new locale keys needed — pure component updates.

| Line | Current | Key | t() call |
|------|---------|-----|----------|
| 397 | `"Chargement..."` | `groups.list.loading` | `tGroups('list.loading')` |
| 402 | `"Aucune communauté"` | `groups.noGroups` | `tGroups('noGroups')` |
| 403 | `"Créez-en une pour commencer"` | `groups.noGroupsDescription` | `tGroups('noGroupsDescription')` |
| 514 | `Privée` | `groups.visibility.private` | `{tGroups('visibility.private')}` |
| 519 | `Publique` | `groups.visibility.public` | `{tGroups('visibility.public')}` |
| 543 | `Inviter` | `groups.actions.invite` | `{tGroups('actions.invite')}` |
| 562 | `À propos` | `groups.details.about` | `{tGroups('details.about')}` |
| 567 | `'Aucune description disponible.'` | `groups.details.noDescription` | `tGroups('details.noDescription')` |
| 573 | `membres` | `groups.members` | `{tGroups('members')}` |
| 576 | `Créée le {date}` | `groups.details.createdOn` | `` `${tGroups('details.createdOn')} ${date}` `` |
| 590 | `"Sélectionnez une communauté"` | `groups.list.selectCommunity` | `{tGroups('list.selectCommunity')}` |
| 592 | `"Choisissez une communauté..."` | `groups.list.selectCommunityDescription` | `{tGroups('list.selectCommunityDescription')}` |

## iOS: ConversationInfoSheet.swift — Color(hex:) → MeeshyColors

4 instances of `Color(hex: "EF4444")` in block button (lines 1212–1229):
- ProgressView tint → `MeeshyColors.error`
- Button text color → `MeeshyColors.error`
- Button background fill (opacity variants) → `MeeshyColors.error.opacity(...)`
- Button border stroke → `MeeshyColors.error.opacity(0.2)`

Role badge colors (lines 1147–1153) — categorize and migrate if using hardcoded hex.

## Also add
- `<Settings>` icon button in groups header (line 550) needs `aria-label={tGroups('actions.settings')}`
