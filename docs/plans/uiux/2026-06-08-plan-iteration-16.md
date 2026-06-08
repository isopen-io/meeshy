# UI/UX Plan — Iteration 16 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-16.md`.

## iOS Pass 1 — Dynamic Type: UploadProgressBar + ReportMessageSheet

Replace all `.font(.system(size: N))` with semantic fonts per size mapping.
See analysis for full line-by-line mapping.

## iOS Pass 2 — Accessibility Labels

- InviteFriendsSheet.swift: add `.accessibilityLabel` to close button
- LocationPickerView.swift: add `.accessibilityLabel` to clear-search button

## Web Pass 1 — Locale keys (common.json × 4 languages)

Add 10 media-control keys to en/fr/es/pt under `common`:
download, play, pause, mute, unmute, enterFullscreen, exitFullscreen, zoomIn, zoomOut, rotate

## Web Pass 2 — VideoLightbox.tsx (7 aria-labels)

Use existing `useI18n('common')` + new keys.

## Web Pass 3 — ImageLightbox.tsx (6 aria-labels)

Use existing `useI18n('common')` + new keys + existing `previous`/`next`.

## Checklist

- [ ] I1 — UploadProgressBar 5× Dynamic Type
- [ ] I2 — ReportMessageSheet 7× Dynamic Type
- [ ] I3 — InviteFriendsSheet accessibilityLabel on close
- [ ] I4 — LocationPickerView accessibilityLabel on clear
- [ ] W1 — 10 keys added to 4 locale files
- [ ] W2 — VideoLightbox 7× aria-label → t()
- [ ] W3 — ImageLightbox 6× aria-label → t()
- [ ] Commit & push
- [ ] CI green
- [ ] Merge into main
