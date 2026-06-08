# UI/UX Plan — Iteration 15 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-15.md`.

## Strategy

Four iOS passes + two web passes.

## iOS Pass 1 — System Color Tokens (3 files)

### ConversationEncryptionDetailSheet.swift
- L139: `.foregroundColor(.orange)` → `.foregroundColor(MeeshyColors.warning)`

### OnboardingStepViews.swift (11 changes)
- L203: `.foregroundColor(.orange)` → `.foregroundColor(MeeshyColors.warning)`
- L229: `Color.orange.opacity(0.08)` → `MeeshyColors.warning.opacity(0.08)`
- L236: `.foregroundColor(.yellow)` → `.foregroundColor(MeeshyColors.warning)`
- L824: `.foregroundColor(.orange)` → `.foregroundColor(MeeshyColors.warning)`
- L833: `.foregroundColor(.orange)` → `.foregroundColor(MeeshyColors.warning)`
- L835: `Color.orange.opacity(0.15)` → `MeeshyColors.warning.opacity(0.15)`
- L838: `Color.orange.opacity(0.08)` → `MeeshyColors.warning.opacity(0.08)`
- L844: `: .orange` → `: MeeshyColors.warning`
- L868: `: .orange` → `: MeeshyColors.warning`
- L988: `.foregroundColor(.orange)` → `.foregroundColor(MeeshyColors.warning)`
- L992: `Color.orange.opacity(0.1)` → `MeeshyColors.warning.opacity(0.1)`

### SecurityVerificationView.swift (2 changes)
- L18: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`
- L45: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`

## iOS Pass 2 — DetailTab.color + MessageAction.color Migration

### MessageDetailSheet.swift
1. `var color: String` → `var color: Color` on `DetailTab`
2. Replace 10 hex string returns with MeeshyColors tokens
3. `MessageAction.color: String` → `MessageAction.color: Color`
4. `DetailGridItem.color: String` → `DetailGridItem.color: Color`
5. L318: `Color(hex: item.color)` → `item.color`

### MessageOverlayMenu.swift
- 7 MessageAction creation sites: replace hex string color with Color value

## Web Pass 1 — aria-label i18n (8 files)

For each file:
1. Add `import { useI18n } from '@/hooks/use-i18n'` (if missing)
2. Add `const { t } = useI18n('common')` inside component (or add namespace if already using useI18n)
3. Replace `aria-label="Fermer"` with `aria-label={t('common.close')}`

Files: PPTXLightbox, VideoLightbox, ImageLightbox, TextLightbox, EmojiPicker, StoryComposer, StoryViewer, ConversationDrawer

## Web Pass 2 — MediaViewers.tsx title= i18n

1. Add `import { useI18n } from '@/hooks/use-i18n'`
2. Add `const { t } = useI18n('attachments')` inside each affected component function
3. Replace 3× French title strings with `t('gallery.fullscreen')`

## Checklist

- [ ] I1 — ConversationEncryptionDetailSheet `.orange` → MeeshyColors.warning
- [ ] I2 — OnboardingStepViews 11× system color → MeeshyColors.warning
- [ ] I3 — SecurityVerificationView `Color(hex: "4ECDC4")` ×2 → MeeshyColors.indigo400
- [ ] I4a — MessageDetailSheet DetailTab.color + MessageAction.color → Color
- [ ] I4b — MessageOverlayMenu MessageAction creation sites → Color
- [ ] W1 — 8 web components aria-label="Fermer" → t('common.close')
- [ ] W2 — MediaViewers.tsx 3× title= → t('gallery.fullscreen')
- [ ] Commit & push on claude/dazzling-hawking-b4tdnk
- [ ] CI green
- [ ] Merge into main
