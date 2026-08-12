# Plan — Iteration-154i — `AudioPostComposerView` VoiceOver & selection

- **Last synchronized commit**: `main` HEAD (post-#1995, `ca22575`)
- **Source branch**: `main`
- **Working branch**: `claude/laughing-thompson-jpq5us`
- **Iteration**: 154i (chosen strictly above the highest in-flight iOS iteration 153i / PR #1994)
- **Merged PR**: _pending_
- **Sync status**: fresh branch from `main` HEAD

## Target selection

Swarm open PRs (140i→153i) claim: ThemedBackButton, MyStoriesView, FriendRequestListView,
StoryExpiredContent, MessageViewsDetailView, ConversationDashboard, VoiceProfileManageView,
StatsTimelineChart, StoryViewerContainer, ChangePasswordView, DeleteAccountView,
EditProfileView, IncomingCallView, MessageDetailSentimentTab. Traîne candidates
(`ConversationBackgroundComponents`, `SecurityVerificationView`) were checked and found
already handled (the animated background is fully `.accessibilityHidden(true)` at its root).

Picked **`AudioPostComposerView`** — a fresh, uncontended, meaty user-facing surface whose
accessibility had never been audited.

## Scope (single file, additive)

1. Language chip → full-name VoiceOver label + `.isSelected` trait (color-only → announced).
2. Decorative `centerContent` (waveform/seal/mic/spinner) → `.accessibilityHidden(true)`.
3. Decorative inline SF Symbols (globe / text.bubble / warning triangle / filter icon) → hidden.
4. “Plus” button → `.accessibilityLabel("Plus de langues")`.
5. Transcription body text → `.textSelection(.enabled)`.

## Constraints honored

- 0 logic change, 0 new test, 0 new xcstrings entry (labels via `Locale` / inline defaultValue).
- No Dynamic Type migration needed (typography already semantic).
- Dark-wash hex colors left untouched (design decision, iter 44/45).

## Gate

CI `ios-tests` (Linux env → no local Xcode build). PR to be opened on push.
