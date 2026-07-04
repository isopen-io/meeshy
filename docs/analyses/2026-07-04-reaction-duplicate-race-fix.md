# Fix — duplicate reactions from the same user (realtime sync audit, cycle 2026-07-04)

## Problem

`ReactionService.addReaction` enforced the "one emoji per user per message" rule
at the application layer: `findMany` existing reactions → compute the emoji(s)
to replace → `deleteMany` → `create`. The DB unique key was `(messageId,
participantId, emoji)` — it does not conflict across two *different* emojis.

Two concurrent `addReaction` calls for **different** emojis from the same
participant (double-tap on two emoji buttons, an optimistic-UI retry racing
the ack, the same account reacting from two devices) both read zero existing
reactions before either commits, so both proceed to `create()` — different
emoji values don't collide on the old unique key, so both inserts succeed.
Result: the participant ends up reacting with two emojis at once on every
peer's screen, with no compensating `reaction:removed` event, and inflated
aggregation counts under both emojis.

The same-emoji race (P2002 on double insert) was already handled; this
cross-emoji race was not — it slipped past the adjacent P2002 test because it
doesn't produce a constraint violation.

## Fix

- `packages/shared/prisma/schema.prisma`: `Reaction.@@unique` narrowed from
  `(messageId, participantId, emoji)` to `(messageId, participantId)` — Mongo
  now enforces "at most one reaction row per participant per message"
  directly, independent of emoji value.
- `services/gateway/src/services/ReactionService.ts`: `addReaction` now does a
  single `prisma.reaction.upsert` keyed on the compound `(messageId,
  participantId)` unique constraint instead of find/deleteMany/create. Two
  concurrent calls with different emojis now target the *same* document —
  Mongo serializes the two `findOneAndUpdate`s instead of letting each insert
  its own row.
- `packages/shared/prisma/migrations/2026-07-04-reaction-single-per-user-unique-index.mongodb.js`:
  ops-run migration (mirrors the `2026-07-02-fix-message-client-id-partial-index`
  pattern) — dedupes any pre-existing `(messageId, participantId)` groups with
  more than one row (keeps the most recent, recomputes `reactionSummary`/
  `reactionCount` for affected messages), then drops/recreates the
  `participant_reaction_unique` index with the narrower key. **Must be run
  against prod Mongo before/at deploy** — same manual `mongosh` execution
  model as prior index migrations in this repo; not automated by CI.
- `services/gateway/src/__tests__/unit/services/ReactionService.test.ts`:
  updated to assert the atomic upsert shape; added a regression test pinning
  the exact `where`/`update`/`create` args for the compound key.

## Scope note — follow-up

`AttachmentReactionService.addAttachmentReaction` and
`CommentReactionService` (and likely `PostReactionService`) share the same
"1 emoji per user" application-level swap template and are believed to carry
an analogous non-atomic window, though their current schemas already key the
upsert including the emoji field (`attachment_participant_reaction:
{attachmentId, participantId, emoji}`), so the fix shape differs slightly.
Left out of this cycle to keep the change small and testable; flagged for a
follow-up pass.
