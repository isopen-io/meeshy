# UI/UX Plan — Iteration 11 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-11.md`.

## Fixes

### [I1] ThreadView — bare French nil-fallbacks
File: `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

- Line 94: `Text(parentMessage.senderName ?? "Inconnu")` → `Text(parentMessage.senderName ?? String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main))`
- Line 158: `Text(message.senderName ?? "Inconnu")` → same pattern

### [I2] NotificationSettingsView — dayLabel localization
File: `apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift`

Replace `dayLabel` helper (lines 257–267) with localized strings:
| Case | Old | New key | English default |
|------|-----|---------|-----------------|
| .mon | "L" | `common.day.mon.short` | "M" |
| .tue | "M" | `common.day.tue.short` | "T" |
| .wed | "M" | `common.day.wed.short` | "W" |
| .thu | "J" | `common.day.thu.short` | "T" |
| .fri | "V" | `common.day.fri.short` | "F" |
| .sat | "S" | `common.day.sat.short` | "S" |
| .sun | "D" | `common.day.sun.short` | "S" |

Add a `dayAccessibilityLabel(_:)` helper returning the full English day name for VoiceOver.

### [I3] ChangePasswordView — French defaultValues
File: `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

- Line 343: `defaultValue: "Mot de passe actuel incorrect"` → `defaultValue: "Incorrect current password"`
- Line 356: `defaultValue: "Une erreur est survenue"` → `defaultValue: "An error occurred"`

### [W1] notification-settings.tsx — full i18n migration
Files:
- `apps/web/locales/en/notifications.json` — add new keys (English)
- `apps/web/locales/fr/notifications.json` — add new keys (French)
- `apps/web/locales/es/notifications.json` — add new keys (Spanish)
- `apps/web/locales/pt/notifications.json` — add new keys (Portuguese)
- `apps/web/components/settings/notification-settings.tsx` — replace ~50 French strings with `t()` calls

New key structure (added inside existing `notifPrefs` object):
- `noPreferences`, `saving`, `missingConsents`, `allowButton`
- `channels.{title,description}`, `channels.push.{label,description}`, `channels.email.{label,description}`, `channels.sound.{label,description}`, `channels.vibration.{label,description}`
- `types.{title,description}`, `types.{newMessage,reply,mention,reaction,contactRequest,groupInvite,memberJoined,memberLeft,conversation,missedCall,voicemail,system}.{label,description}`
- `dnd.{title,description,enableLabel,enableDescription,startTime,endTime,activePeriodNote}`
- `display.{title,description}`, `display.{preview,senderName,group,badge}.{label,description}`
- `permissionsTitle`, `permissionStatusTitle`, `browserNotifications`
- `permissionStatus.{granted,denied,pending}`
- `permissionDeniedInstructions`, `unsupported`, `resetButton`

## Checklist

- [ ] I1 — ThreadView 2 French nil-fallbacks → String(localized:)
- [ ] I2 — NotificationSettingsView dayLabel 7 keys + a11y labels
- [ ] I3 — ChangePasswordView 2 French defaultValues → English
- [ ] W1 — Add i18n keys to all 4 locale files
- [ ] W1 — Replace hardcoded French strings in notification-settings.tsx
- [ ] Commit on `claude/dazzling-hawking-FeZgq`
- [ ] Push & CI green
- [ ] Merge into main
