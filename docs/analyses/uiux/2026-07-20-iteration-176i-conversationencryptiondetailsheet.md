# Iteration-176i — Localization of the load-error string in `ConversationEncryptionDetailSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) — encryption status sheet error feedback
**File touched:** `apps/ios/Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift` (1 file, 0 logic, 0 new test)

## Component

`ConversationEncryptionDetailSheet` is the `Form`-based sheet presented from
`ConversationInfoSheet.swift:960` that shows a conversation's end-to-end
encryption status and lets the user enable encryption (Server / E2EE / Hybrid
mode). It renders a loading row, an active-state summary, or an enable-state
picker, plus a shared error `Section` (lines 38–44) that surfaces
`errorMessage` in `MeeshyColors.error`.

## Finding

The file is otherwise a model of the codebase's localization idiom — it routes
**every** user-facing string through `String(localized:defaultValue:bundle:)`:
~25 calls covering the navigation title, section headers/footers, mode labels
and descriptions, the loading row, the activation CTA, and the immutability
footer.

A single string escaped that idiom. In `loadStatus()` (line 250) the
status-fetch failure path assigned a **hardcoded, unlocalized English literal**
directly to the rendered `errorMessage`:

```swift
errorMessage = "Unable to read status: \(error.localizedDescription)"
```

Because `errorMessage` is displayed verbatim in the error `Section`, a
non-English user hitting a transient fetch failure (offline, server error) saw
raw English `"Unable to read status: …"` inside an otherwise fully-localized
sheet — a visible localization regression on an error surface (error states are
explicitly in the UX/i18n review scope).

The sibling catch in `activate()` (line 272) assigns
`error.localizedDescription` with **no** app-authored prefix — that is a
system-provided, already-localized error string, not a hardcoded literal, so it
was correctly left untouched.

## Fix

Wrapped the assignment in the exact same idiom used 25× elsewhere in the file,
preserving the interpolated runtime detail:

```swift
errorMessage = String(localized: "conversation.encryption.detail.readStatusError",
                      defaultValue: "Unable to read status: \(error.localizedDescription)",
                      bundle: .main)
```

- One new inline-`defaultValue` key: `conversation.encryption.detail.readStatusError`.
- French/other-locale translations resolve through the String Catalog like the
  rest of the file's keys; the English default ships inline (0 `.xcstrings`
  hand-edit, matching this file's — and 167i/164i's — code-only doctrine).
- Interpolation inside `defaultValue` is established idiom
  (`EmailVerificationView.swift:82`, `StatusBarView.swift:88`,
  `BubbleMetaBadges.swift:101`, `UploadProgressBar.swift:43`).

Zero logic change: the assignment target, control flow, `os.Logger` line, and
the error `Section` rendering are all untouched. The runtime
`error.localizedDescription` detail is preserved verbatim in the default value.

## Rationale

Error states are in-scope for the localization review, and this was the last
raw user-facing literal in an otherwise exemplary file — the smallest, safest
possible convergence toward "every screen localization-ready." No visual change,
no behavior change, no new dependency.

## Verification

- **Static review:** `String(localized:defaultValue:bundle:)` with an
  interpolated `defaultValue` is a standard iOS 16.0+ API with four in-repo
  precedents (cited above). App floor is iOS 16.0 — no availability guard needed.
- **No test churn:** no test references `ConversationEncryptionDetailSheet`
  (grep across `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). The sole
  call site (`ConversationInfoSheet.swift:960`) passes `conversationId` /
  `accentColor` unchanged — the public signature is untouched.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  Xcode compile/localization run happens in CI. Confirm `iOS Tests` is green on
  the PR before merge.

## Remaining improvements (future iterations)

- Dynamic Type: the file uses only semantic fonts (`.headline`, `.caption`,
  `.subheadline`, `.title2`) — already Dynamic-Type-correct, no change needed.
- VoiceOver: the active/enable state icons (`lock.shield.fill`, `lock.open`,
  `lock.fill`) each sit beside an explicit adjacent text label, so state is not
  conveyed by color/icon alone — no gap. Not re-flag.
- Backups surfaced during this scan (untaken): `StatusComposerView`
  (`Text("\(count)/122")` numeric counter not run through a locale-aware
  formatter), and the UIKit `MediaPostCell`/`TextPostCell` icon-only
  like/comment/repost buttons lacking VoiceOver labels.

**Status: RESOLVED for `ConversationEncryptionDetailSheet` localization.**
