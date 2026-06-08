# UI/UX Plan — Iteration 5 (2026-06-08)

## Goals

1. iOS: FeedPostCard+Media — accessibility labels on all 15+ media-grid tap gestures (CRITICAL)
2. iOS: ThreadView + FeedPostCard+Media — Dynamic Type migration (semantic fonts)
3. iOS: ThreadView — accessibility labels on dismiss/send buttons
4. iOS: ThreadView — localize French fallback "Inconnu"
5. iOS: ThemedConversationRow — localize French accessibility label + typing indicator + Dynamic Type
6. Web: AudioRecorderCard — aria-labels on 4 icon buttons + i18n for recorder UI strings
7. Web: notification-settings — i18n French confirm dialog + error messages
8. Web: TextLightbox + TextViewer — i18n copy-error toast

---

## iOS: FeedPostCard+Media.swift

### Step 1 — Add helper functions (after `openFullscreen`)

```swift
private func galleryLabel(_ media: FeedMedia, index: Int, total: Int) -> String {
    let type = media.type == .video
        ? String(localized: "feed.media.type.video", defaultValue: "Video", bundle: .main)
        : String(localized: "feed.media.type.photo", defaultValue: "Photo", bundle: .main)
    return "\(type) \(index + 1)/\(total)"
}

private func morePhotosLabel(remaining: Int) -> String {
    "\(remaining) " + String(localized: "feed.media.more.photos", defaultValue: "more photos", bundle: .main)
}
```

### Step 2 — Add accessibility to every tap in `mediaPreview`

For each `.onTapGesture { openFullscreen(mediaList[i]) }`, insert before the gesture:
```swift
.accessibilityLabel(galleryLabel(mediaList[i], index: i, total: count))
.accessibilityAddTraits(.isButton)
```

For the "+N" ZStack (5+ layout):
```swift
.accessibilityLabel(count > 5 ? morePhotosLabel(remaining: count - 5) : galleryLabel(mediaList[4], index: 4, total: count))
.accessibilityAddTraits(.isButton)
```

### Step 3 — `imageMediaView` tap

```swift
.accessibilityLabel(String(localized: "feed.media.type.photo", defaultValue: "Photo", bundle: .main))
.accessibilityAddTraits(.isButton)
```

### Step 4 — Dynamic Type in `galleryImageView`, `documentMediaView`, `locationMediaView`

Replace all `.font(.system(size: N, ...)` with semantic equivalents (see analysis table).

---

## iOS: ThreadView.swift

### Step 1 — Semantic fonts

Replace all 13 `.font(.system(size: N, ...))` usages with semantic equivalents (see analysis table).

### Step 2 — Accessibility labels on buttons

```swift
// dismiss button
Button { ... } label: {
    Image(systemName: "chevron.left")...
}
.accessibilityLabel(String(localized: "thread.back.button", defaultValue: "Back", bundle: .main))

// send button
Button { ... } label: { ... }
.accessibilityLabel(String(localized: "thread.send.button", defaultValue: "Send reply", bundle: .main))
```

### Step 3 — Localize "Inconnu" fallback

```swift
// Line 94 + 158
?? String(localized: "thread.unknownSender", defaultValue: "Unknown", bundle: .main)
```

---

## iOS: ThemedConversationRow.swift

### Step 1 — Conversation name Dynamic Type

```swift
// Line 143
.font(.body.weight(conversation.userState.unreadCount > 0 ? .bold : .semibold))
```

### Step 2 — Reaction emoji Dynamic Type + accessibility label

```swift
// Lines 150–152
Text(r)
    .font(.caption)
    .accessibilityLabel(Text(verbatim: "\(String(localized: "conversation.row.reaction", defaultValue: "Reaction", bundle: .main)) \(r)"))
```

### Step 3 — Typing indicator: localize + Dynamic Type

```swift
// Extract computed property
private var typingIndicatorText: String {
    if let username = typingUsername {
        let isTyping = String(localized: "conversation.row.typing", defaultValue: "is typing", bundle: .main)
        return "\(username) \(isTyping)"
    }
    return String(localized: "conversation.row.typing.generic", defaultValue: "Typing…", bundle: .main)
}

// In typingIndicatorView
Text(typingIndicatorText)
    .font(.footnote.italic())
```

---

## Web: AudioRecorderCard.tsx

### Step 1 — Add i18n keys to `components.json` (×4 languages)

Under `components.audioRecorder`:
- `initializing`: "Initializing..." / "Initialisation..." / "Inicializando..." / "A inicializar..."
- `recording`: "REC" (same all langs)
- `stop`: "STOP" (same all langs)
- `playing`: "Playing..." / "Lecture..." / "Reproduciendo..." / "A reproduzir..."
- `ready`: "Ready" / "Prêt" / "Listo" / "Pronto"
- `errors.httpsRequired`: "Audio recording requires HTTPS." / ...
- `errors.notSupported`: "Your browser does not support audio recording." / ...
- `errors.permissionDenied`: "Microphone access denied." / "Accès au microphone refusé." / ...
- `errors.notFound`: "No microphone detected." / "Aucun microphone détecté." / ...
- `errors.micError`: "Microphone error." / "Erreur microphone." / ...
- `errors.accessDenied`: "Unable to access microphone." / "Impossible d'accéder au microphone." / ...
- `errors.playbackError`: "Playback error." / "Erreur lors de la lecture." / ...
- `errors.audioPlaybackError`: "Audio playback error." / "Erreur de lecture audio." / ...

### Step 2 — Update AudioRecorderCard.tsx

Add `const { t } = useI18n('components');`, replace 13 hardcoded strings.
Add `aria-label` to 4 icon buttons.

---

## Web: notification-settings.tsx

### Step 1 — Add keys to `settings.json` (×4 languages)

Under `settings.notifications`:
- `errors.saveError`: "Error saving settings" / ...
- `errors.timeRangeOverlap`: "Start time must be different from end time" / ...
- `resetConfirm`: "Do you really want to reset all notification preferences?" / ...

### Step 2 — Update `notification-settings.tsx`

Replace 3 hardcoded French strings with `t('settings.notifications.errors.*')` calls.

---

## Web: TextLightbox.tsx + TextViewer.tsx

Add `t('common.copyError')` key to `common.json` (×4 languages):
```json
"copyError": "Unable to copy"
```
Replace `'Impossible de copier'` with `t('common.copyError')`.

---

## Commit & CI

Single commit: `uiux(iter-5): media-grid a11y + Dynamic Type iOS + web i18n audioRecorder/notifications/copy`
Push → CI → merge to main → start iteration 6.

---

## Checklist

- [x] iOS: FeedPostCard+Media — accessibility labels (15 taps)
- [x] iOS: FeedPostCard+Media — Dynamic Type (8 violations)
- [x] iOS: ThreadView — Dynamic Type (13 violations)
- [x] iOS: ThreadView — a11y buttons + "Unknown" fallback
- [x] iOS: ThemedConversationRow — Dynamic Type (3 violations) + French strings
- [x] Web: components.json — audioRecorder i18n keys (×4 langs)
- [x] Web: AudioRecorderCard.tsx — aria-labels + i18n
- [x] Web: settings.json — notification i18n keys (×4 langs)
- [x] Web: notification-settings.tsx — use i18n keys
- [x] Web: common.json — copyError key (×4 langs)
- [x] Web: TextLightbox.tsx + TextViewer.tsx — t('toasts.copyError')
