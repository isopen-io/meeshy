# Iteration 196i — `ActiveSessionsView` empty-state design-system dedup

## Surface
`apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift` — screen "Sessions actives"
(list of active login sessions, security-sensitive). Reached from Settings → security.

## Findings
The empty-state branch (`viewModel.sessions.isEmpty`) rendered a **bare, icon-less `Text`**
sandwiched between two `Spacer()`s:

```swift
} else if viewModel.sessions.isEmpty {
    Spacer()
    Text(String(localized: "sessions_empty", defaultValue: "Aucune session active"))
        .font(MeeshyFont.relative(15, weight: .medium))
        .foregroundColor(theme.textMuted)
    Spacer()
}
```

Deficits vs the established design system:
1. **No icon** — every other empty state in the app pairs an SF Symbol with the title
   (`FeedView`, `StarredMessagesView` 175i, `AddParticipantSheet` 176i, `CreateShareLinkView`,
   `FriendRequestListView` 185i). This one was a lone line of muted text — the weakest empty
   state remaining after 185i solved its sibling `FriendRequestListView`.
2. **No guidance subtitle** — title-only, no explanation of what the (rare) empty list means.
3. **Design-system duplication** — hand-rolled `Spacer`/`Text`/`Spacer` instead of the shared
   `AdaptiveContentUnavailableView` primitive already adopted by 5+ screens.
4. **Fixed font** — `MeeshyFont.relative(15)` rather than a native component whose glyph + text
   scale with Dynamic Type out of the box.

## Fix
Replace the bespoke branch with the shared native wrapper:

```swift
private var emptyState: some View {
    AdaptiveContentUnavailableView(
        String(localized: "sessions_empty", defaultValue: "Aucune session active"),
        systemImage: "laptopcomputer.and.iphone",
        description: Text(String(localized: "sessions_empty_subtitle",
            defaultValue: "Vos appareils connectes apparaitront ici."))
    )
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

- `AdaptiveContentUnavailableView` = native `ContentUnavailableView` on iOS 17+, faithful
  reproduction on the iOS 16 floor (`MeeshyUI/Compatibility`). Already imported.
- `systemImage: "laptopcomputer.and.iphone"` — SF Symbols 4 (iOS 16.0, within the app floor);
  semantically the "your logged-in devices" concept, coherent with the row glyphs
  (`iphone` / `desktopcomputer`). Scales with Dynamic Type natively.
- **Title reuses the existing `sessions_empty` key** → 0 catalog edit for the title.
- **1 new subtitle key** `sessions_empty_subtitle`, inline `defaultValue` (FR) — exempt from
  `LocalizationConsistencyTests` (keys with an inline default are skipped by design), same
  convention as `friends.requests.empty.subtitle` (185i). Xcode auto-extracts at build.
- `.frame(maxWidth: .infinity, maxHeight: .infinity)` preserves the former vertical centring.

## Gains
- HIG: native component, SF Symbol, native title+description VoiceOver grouping.
- Design-system dedup (−1 bespoke empty state; the last icon-less one in this cluster).
- Dynamic Type: icon + text scale natively (was a fixed `MeeshyFont.relative(15)`).
- Guidance subtitle added (was title-only).

## Scope / risk
- 1 production file (`ActiveSessionsView.swift`), +1 guard test method in the existing
  `ActiveSessionsViewAccessibilityTests`.
- 0 logic / 0 network / 0 ViewModel change / 0 color change / 0 catalog edit.
- The 4 pre-existing 168i a11y guards still hold (`.combine`, `.accessibilityHidden(true)`,
  `.isHeader`, `sessions_revoke` all preserved — header/rows/revoke untouched).
- No open PR touches `ActiveSessionsView` (verified via `list_pull_requests`, swarm ≤195i).
- Gate = CI `iOS Tests` (Linux env — no local Xcode; established pattern).

## Status
Resolved 196i. **Do not re-flag** `ActiveSessionsView` empty state (native/dedup/subtitle solved).
