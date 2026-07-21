# Plan — Iteration 209i — InviteFriendsSheet i18n completion

**Surface**: `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift`
**Goal**: Localize the two remaining user-visible hardcoded strings, completing the file's i18n.

## Steps

1. **`ConversationType.displayName` (lines 722–735)** — replace the 8 bare French literals with
   the existing SSOT keys `conversation.type.{direct,group,public,global,community,channel,bot,broadcast}`
   (`String(localized:defaultValue:bundle:.main)`), mirroring `SharePickerView.swift:331–338`.
   - 0 new keys.
   - Corrects `Public`→`Publique`, `Communaute`→`Communauté` (accent) to match the app SSOT.
2. **Picker label (line 396)** — `Picker("Expiration", …)` →
   `Picker(String(localized: "invite.expiration.title", defaultValue: "Expiration", bundle: .main), …)`.
   - 1 new inline key, namespaced under the existing `invite.expiration.*` family.
3. Write analysis (`docs/analyses/uiux/2026-07-21-iteration-209i-invitefriendssheet-i18n.md`).
4. Append `branch-tracking.md` pointer + table row.
5. Commit + push to `claude/laughing-thompson-qnbyua`.

## Constraints

- iOS-only. 1 production file. 0 logic / 0 layout / 0 SDK change.
- Gate = CI `iOS Tests` (no Swift toolchain in this Linux env).

## Validation

- Grep: no user-visible hardcoded literals remain (only decorative `·`).
- Parity with `SharePickerView` SSOT and the file's `invite.*` convention.
- Collision: `InviteFriendsSheet.swift` absent from all open PRs.
