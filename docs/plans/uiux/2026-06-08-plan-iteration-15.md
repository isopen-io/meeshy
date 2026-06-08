# UI/UX Plan — Iteration 15 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-15.md`.

## Branch
```
feat/uiux-iter15  (from main HEAD 87d4e676)
```

## Scope

7 issues across 6 iOS files + 1 web file + 4 locale files.

---

## iOS Pass 1 — Color tokens (I1, I2, I3)

### I1 — CallWaitingBannerView.swift
- L59: `.background(.red, in: Capsule())` → `.background(MeeshyColors.error, in: Capsule())`
- L72: `.background(.green, in: Capsule())` → `.background(MeeshyColors.success, in: Capsule())`

### I2 — ConversationView.swift
- L1096: `.foregroundStyle(.yellow)` → `.foregroundStyle(MeeshyColors.warning)`

### I3 — ContextActionMenu.swift
- L92: `return .red` → `return MeeshyColors.error`

---

## iOS Pass 2 — MessageDetailSentimentTab (I4)

### i18n (lines 81–85)
- `"Tres negatif"` → `"Very negative"`
- `"Negatif"` → `"Negative"`
- `"Neutre"` → `"Neutral"`
- `"Positif"` → `"Positive"`
- `"Tres positif"` → `"Very positive"`

### Dynamic Type (lines 27, 56 — keep line 24 as-is)
- L27: `.font(.system(size: 16, weight: .semibold))` → `.font(.callout.weight(.semibold))`
- L56: `.font(.system(size: 13, weight: .medium))` → `.font(.footnote.weight(.medium))`

### Gradient colors (line 35)
- `[.red, .orange, .yellow, .green]` → `[MeeshyColors.error, MeeshyColors.warning, MeeshyColors.warning, MeeshyColors.success]`

---

## iOS Pass 3 — BubbleMetaBadges (I5)

### i18n French → English
- `"Enregistrement…"` → `"Saving…"`
- `"modifie"` → `"Edited"`
- `"Epingle"` → `"Pinned"`
- `"Message epingle"` → `"Pinned message"`
- `"Transf. de {name} • {conversationName}"` → `"Fwd. from {name} • {conversationName}"`
- `"Transf. de {name}"` → `"Fwd. from {name}"`
- `"Transfere"` → `"Forwarded"`
- `"Message ephemere, expire dans {timer}"` → `"Ephemeral message, expires in {timer}"`

### Dynamic Type — all badge fonts → caption2
See table in analysis. All sizes 8–11 → `.caption2` with appropriate weight modifiers.
Sizes 8 → add `.minimumScaleFactor(0.8)` on Text view.
Monospaced L143 → `.system(.caption2, design: .monospaced).weight(.bold)`.

---

## iOS Pass 4 — ConversationEncryptionDetailSheet (I6)

Replace all 24+ French `defaultValue` strings with English equivalents.
Full table in analysis file.

---

## Web Pass — PostCard i18n (W1)

### Step 1: Add keys to locale files

File: `apps/web/locales/en/components.json`
Add under `components.post`:
```json
"post": {
  "pinned": "Pinned",
  "menu": "Post menu",
  "edit": "Edit",
  "pin": "Pin",
  "unpin": "Unpin",
  "delete": "Delete",
  "like": "Like post",
  "unlike": "Unlike post",
  "repost": "Repost",
  "bookmark": "Bookmark",
  "removeBookmark": "Remove bookmark"
}
```

Files: fr/components.json, es/components.json, pt/components.json — add translated equivalents.

### Step 2: Add `useI18n` to PostCard

```tsx
import { useI18n } from '@/hooks/use-i18n';
// Inside component:
const { t } = useI18n('components');
```

### Step 3: Replace hardcoded strings

| Location | Before | After |
|----------|--------|-------|
| L133 | `Pinned` | `{t('post.pinned')}` |
| L160 | `aria-label="Post menu"` | `aria-label={t('post.menu')}` |
| L176 | `Edit` | `{t('post.edit')}` |
| L184 | `isPinned ? 'Unpin' : 'Pin'` | `isPinned ? t('post.unpin') : t('post.pin')` |
| L190 | `Delete` + `text-red-500` | `{t('post.delete')}` + `text-[var(--color-error)]` (or existing CSS var) |
| L285 | `isLiked ? 'Unlike post' : 'Like post'` | `isLiked ? t('post.unlike') : t('post.like')` |
| L347 | `aria-label="Repost"` | `aria-label={t('post.repost')}` |
| L372 | `isBookmarked ? 'Remove bookmark' : 'Bookmark'` | `isBookmarked ? t('post.removeBookmark') : t('post.bookmark')` |

### Step 4: Fix Delete button color
- `text-red-500` → check existing CSS var for error color. The app uses `var(--color-destructive)` or similar. Use `text-destructive` if Tailwind CSS var token exists, otherwise keep `text-red-500` (minor).

---

## Checklist

- [x] I1 — CallWaitingBannerView: .red/.green → MeeshyColors
- [x] I2 — ConversationView: .yellow → MeeshyColors.warning
- [x] I3 — ContextActionMenu: .red → MeeshyColors.error
- [x] I4a — MessageDetailSentimentTab: 5× French → English
- [x] I4b — MessageDetailSentimentTab: 2× Dynamic Type fonts
- [x] I4c — MessageDetailSentimentTab: gradient colors → MeeshyColors
- [x] I5a — BubbleMetaBadges: 8× French → English
- [x] I5b — BubbleMetaBadges: 12× Dynamic Type fonts
- [x] I6 — ConversationEncryptionDetailSheet: 24+ French → English
- [x] W1a — locales/en/components.json: add post.* keys
- [x] W1b — locales/fr/components.json: add post.* keys (French)
- [x] W1c — locales/es/components.json: add post.* keys (Spanish)
- [x] W1d — locales/pt/components.json: add post.* keys (Portuguese)
- [x] W1e — PostCard.tsx: add useI18n + replace 8 hardcoded strings
- [ ] Commit & push on feat/uiux-iter15
- [ ] CI green
- [ ] Merge into main
- [ ] Update branch-tracking.md
