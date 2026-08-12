# Fix — duplicate attachment reactions from the same user (realtime sync audit, cycle 2026-07-04, follow-up)

## Problem

`AttachmentReactionService.addAttachmentReaction` enforced the "one emoji per
user per attachment" rule at the application layer: `findMany` existing
reactions → conditional `deleteMany` → `upsert`. The DB unique key was
`(attachmentId, participantId, emoji)` — it does not conflict across two
*different* emojis, exactly the same shape as the bug fixed the same day in
`ReactionService.addReaction` (see `2026-07-04-reaction-duplicate-race-fix.md`,
whose "Scope note — follow-up" flagged this file as carrying an analogous
window).

Two concurrent `addAttachmentReaction` calls for **different** emojis from the
same participant (double-tap on two reaction buttons on the same image, an
optimistic-UI retry racing the ack, the same account reacting from two
devices) both read zero (or the same single) existing reaction before either
commits, so both proceed to the `upsert` — different emoji values don't
collide on the old unique key, so both inserts succeed. Result: the
participant ends up reacting to the same attachment with two emojis at once
on every peer's screen (`AttachmentReactionHandler` recomputes
`reactionSummary` via a live `findMany`, which then counts both rows).

## Fix

- `packages/shared/prisma/schema.prisma`: `AttachmentReaction.@@unique`
  narrowed from `(attachmentId, participantId, emoji)` to `(attachmentId,
  participantId)` — Mongo now enforces "at most one reaction row per
  participant per attachment" directly, independent of emoji value.
- `services/gateway/src/services/AttachmentReactionService.ts`:
  `addAttachmentReaction` now does a single `prisma.attachmentReaction.upsert`
  keyed on the compound `(attachmentId, participantId)` unique constraint
  instead of findMany/deleteMany/upsert. Two concurrent calls with different
  emojis now target the *same* document — Mongo serializes the two
  `findOneAndUpdate`s instead of letting each insert its own row. The now-dead
  `MAX_REACTIONS_PER_USER` constant and the pre-upsert `findMany`/`deleteMany`
  step were removed.
- `packages/shared/prisma/migrations/2026-07-04-attachment-reaction-single-per-user-unique-index.mongodb.js`:
  ops-run migration (mirrors the sibling `Reaction` migration) — dedupes any
  pre-existing `(attachmentId, participantId)` groups with more than one row
  (keeps the most recent), then drops/recreates the
  `attachment_participant_reaction` index with the narrower key. No aggregate
  counter to recompute here (unlike `Message.reactionSummary`) —
  `AttachmentReactionService.getReactionSummary()` always recomputes live from
  `AttachmentReaction` rows. **Must be run against prod Mongo before/at
  deploy** — same manual `mongosh` execution model as prior index migrations
  in this repo; not automated by CI.
- `services/gateway/src/services/__tests__/AttachmentReactionService.test.ts`
  and `services/gateway/src/__tests__/unit/services/AttachmentReactionService.test.ts`:
  updated to assert the atomic upsert shape (no `findMany`/`deleteMany` in the
  add path); added a regression test racing two concurrent adds with
  different emojis and asserting exactly one row survives.

## Scope note — remaining follow-up

`CommentReactionService` and `PostReactionService` share a related "1 emoji
per user" application-level check, but their current behavior *rejects*
(throws `Maximum 1 different reactions per <entity> reached`) instead of
swapping, so the failure mode differs from the swap-race fixed here and in
`ReactionService`. Left out of this cycle to keep the change scoped and
testable — flagged for a follow-up pass if the same swap semantics are ever
wanted there.
