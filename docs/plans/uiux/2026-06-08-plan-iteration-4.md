# UI/UX Plan — Iteration 4 (2026-06-08)

## Goals

1. iOS: MeeshyColors migration for DeleteAccountView, BubbleMetaBadges, ConversationInfoSheet role badges, BubbleFooter, StatusBarView
2. iOS: Localize 2 hardcoded accessibility strings in BubbleFooter
3. Web: i18n PushPermissionBanner (notifications namespace)
4. Web: i18n PermissionRequest (calls namespace)
5. Web: i18n MentionAutocomplete (bubbleStream namespace)

---

## iOS: MeeshyColors Migration

### A · DeleteAccountView.swift

Replace `private let accentColor = "EF4444"` with a computed property:
```swift
private var accentColor: Color { MeeshyColors.error }
```
Remove all `Color(hex: accentColor)` → use `accentColor` directly (or `MeeshyColors.error` inline).
Replace `Color(hex: "4ADE80")` → `MeeshyColors.success` (lines 176, 189).
Replace `Color(hex: "6366F1")` → `MeeshyColors.indigo500` (lines 272, 313).

### B · BubbleMetaBadges.swift

Replace `Color(hex: "FF6B6B")` × 4 (lines 140, 144, 150, 153) → `MeeshyColors.error`.

### C · ConversationInfoSheet.swift

`roleBadgeColor(_:)` function (lines 1147–1152):
```swift
case "admin", "creator": return MeeshyColors.error
case "moderator": return MeeshyColors.warning
default: return MeeshyColors.info
```
Line 921: `.green` → `MeeshyColors.success`.

### D · BubbleFooter.swift

Line 156: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`.
Lines 159–161: Localize accessibility strings:
```swift
.accessibilityLabel(model.showsTranslate
    ? String(localized: "bubble.footer.translation.available", defaultValue: "Translation available", bundle: .main)
    : String(localized: "bubble.footer.translation.request", defaultValue: "Request translation", bundle: .main))
```

### E · StatusBarView.swift

Line 56: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo300`.

---

## Web: i18n — PushPermissionBanner

### Step 1 — Add keys to notifications.json (×4 languages)

Under `notifications.push`:
- `title`: "Enable push notifications" / "Activer les notifications push" / "Activar notificaciones push" / "Ativar notificações push"
- `description`: "Get notified even when the app is in the background" / ...
- `enable`: "Enable" / "Activer" / "Activar" / "Ativar"
- `enabled`: "Push notifications enabled" / ...
- `denied`: "Push notifications denied. You can change this in your browser settings." / ...

### Step 2 — Update PushPermissionBanner.tsx

Add `useI18n('notifications')`, replace 5 hardcoded strings.

---

## Web: i18n — PermissionRequest

### Step 1 — Add keys to calls.json (×4 languages)

Under `calls.permissions`:
- `title.idle` / `title.granted` / `title.denied`
- `description.idle` / `description.granted`
- `error.denied` / `error.notFound` / `error.notReadable` / `error.generic` / `error.unexpected`
- `buttons.grantAccess` / `buttons.cancel` / `buttons.tryAgain`
- `requesting.message`
- `joining`
- `instructions.title` / `instructions.chrome` / `instructions.firefox` / `instructions.safari`

### Step 2 — Update PermissionRequest.tsx

Add `useI18n('calls')`, extract error message strings to i18n, replace all hardcoded strings.

---

## Web: i18n — MentionAutocomplete

### Step 1 — Add keys to bubbleStream.json (×4 languages)

Under `bubbleStream.mention`:
- `badge.present`: "Present" / "Présent" / "Presente" / "Presente"
- `badge.invite`: "Invite" / "Inviter" / "Invitar" / "Convidar"
- `title`: "Mention a user" / "Mentionner un utilisateur" / ...
- `searchPlaceholder`: "Type to search for a user..." / ...
- `noResults`: "No user found for '{query}'" / ...
- `helpText`: "↑↓ navigate • Enter select • Esc close" / ...

### Step 2 — Update MentionAutocomplete.tsx

Add `useI18n('bubbleStream')`, replace 6 hardcoded strings.

---

## Commit & CI

Single commit: `uiux(iter-4): i18n (push/permissions/mention) + iOS MeeshyColors (bubbles/account/roles)`
Push → CI → merge to main → start iteration 5.
