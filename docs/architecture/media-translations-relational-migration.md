# Migration plan — `MessageAttachment.translations: Json?` → relational `MediaTranslation`

Status: **DESIGN — pending architectural review**
Author: Claude (R8 of the stories media-model refactor, PR #272)
Date: 2026-05-20

## Why this migration

Today both `MessageAttachment.translations` and `PostMedia.translations`
are `Json?` Prisma columns. The shape is a `Record<lang, AttachmentTranslation>`
validated by `attachment-validators.ts` at the boundary (R6). The
representation has served the product well but has reached three
ceilings that block the next-quarter feature set:

1. **No indexed query by target language.** Every "give me the audio in
   `fr`" path loads the full translations blob, parses it, then picks
   the entry. For a feed page with 30 stories × 5 cached languages
   that's 150 JSON deserializations on the hot path. A relational table
   would resolve via `WHERE attachmentId = ? AND language = ?` with a
   compound index — one B-tree probe instead of one scan-parse per row.

2. **No cascade / soft-delete primitives.** Soft-deleting a translation
   today means rewriting the entire JSON map and re-validating it.
   Future features (TTS regeneration, voice-clone re-roll on user
   profile update) need to delete + recreate one entry without
   touching the other 9. Doing that in Json is a read-modify-write race;
   doing it on a relational row is a single `delete + insert`.

3. **No optimistic-adoption identity.** R4 introduced
   `OptimisticAttachmentAdopter` on iOS so attachments can swap their
   `file://` URL for an `https://` URL after server ACK without
   redrawing the message bubble. For translations to participate in the
   same pattern, each translation needs a stable ID — which Json maps
   can't provide.

The schema change unblocks all three. Prisme Linguistique semantics are
preserved 1:1: a translation is still keyed by ISO 639-1 language code
on the read path; only the storage representation changes.

## Proposed schema

```prisma
model MediaTranslation {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId

  // Polymorphic parent — exactly one of these two is set per row.
  // Discriminator is implicit (only one FK is non-null). Avoids
  // a string discriminator + two parallel indexes.
  attachmentId  String?  @db.ObjectId
  attachment    MessageAttachment? @relation(fields: [attachmentId], references: [id], onDelete: Cascade)
  postMediaId   String?  @db.ObjectId
  postMedia     PostMedia? @relation(fields: [postMediaId], references: [id], onDelete: Cascade)

  // Translation contract — matches AttachmentTranslation (attachment-audio.ts)
  type          String   // 'audio' | 'video' | 'text' | 'document' | 'image'
  language      String   // ISO 639-1, the target language
  transcription String   // The translated text (yes, the field name is a historical accident)
  path          String?
  url           String?

  // Audio/video specifics
  durationMs    Int?
  format        String?
  cloned        Boolean?
  quality       Float?
  voiceModelId  String?
  ttsModel      String?
  // `segments` stays as Json — array of {text, startMs, endMs, ...}.
  // Promoting it to MediaTranslationSegment is R9, not R8.
  segments      Json?

  // Document/image specifics
  pageCount       Int?
  overlayApplied  Boolean?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?  // soft-delete (replaces the legacy Json-level marker)

  // ── Indexes ──
  // Compound indexes on (parentId, language) replicate the lookup
  // pattern hit by the Prisme resolver on every read.
  @@index([attachmentId, language])
  @@index([postMediaId, language])
  // Allow listing by language across a conversation feed
  @@index([language, createdAt(sort: Desc)])
}
```

## Migration strategy — dual-write, then dual-read, then deprecate

This MUST land without a deploy freeze on the feed paths. Three phases:

### Phase 1 — Schema additive (no data move)

Land the `MediaTranslation` model alongside the existing `translations: Json?`
columns. Both coexist. The schema migration is purely additive — no
backfill, no downtime.

**Risk: zero.** Existing `Json?` reads keep working.

### Phase 2 — Dual-write at every persistence site

Every gateway path that writes `translations` (today: PostAudioService,
AttachmentTranslateService, MessageProcessor) writes BOTH the Json blob
AND inserts a `MediaTranslation` row inside the same Prisma transaction.

```typescript
await prisma.$transaction([
  prisma.messageAttachment.update({
    where: { id },
    data: { translations: { ...existing, [lang]: payload } },
  }),
  prisma.mediaTranslation.create({
    data: {
      attachmentId: id,
      language: lang,
      type: payload.type,
      transcription: payload.transcription,
      // ...
    },
  }),
]);
```

Reads stay on the Json blob. Validation of the dual-write happens via a
new test fixture that asserts `Object.keys(att.translations).sort() ===
mediaTranslations.map(t => t.language).sort()` on a representative sample.

**Risk: low.** Dual-write doubles the write cost on the audio pipeline
(once per language × translation count) but the audio pipeline is
already an asynchronous ZMQ-driven flow; a 2× write is invisible to
the user.

### Phase 3 — Backfill historical Json blobs

A one-shot maintenance script (similar to `services/gateway/scripts/`
existing migrations) iterates every attachment with a non-null
`translations` blob and creates the corresponding `MediaTranslation`
rows. Idempotent — uses `upsert` keyed by `(attachmentId, language)`.

Run during a low-traffic window; resumable; logs progress every 1k rows.
On a 100M-row collection at ~5ms/row that's ≈8 hours, fine for an
overnight job.

**Risk: medium.** A long-running migration over a live database. Mitigated
by:
- Batches of 1000 with a 50ms sleep between batches (caps Mongo OPS).
- Idempotent — re-running picks up where it left off.
- A flag `--dry-run` that counts rows without writing, for capacity
  planning before the real run.

### Phase 4 — Switch reads to the relational table

Update `attachmentMediaSelect` / `attachmentFullSelect` to drop the
`translations: true` field and replace with a relation include:

```typescript
export const attachmentMediaSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  // ... unchanged fields ...
  mediaTranslations: {
    select: {
      id: true,
      language: true,
      type: true,
      transcription: true,
      url: true,
      durationMs: true,
      cloned: true,
      quality: true,
      voiceModelId: true,
      ttsModel: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { deletedAt: null },
  },
});
```

The gateway response shape changes from
`translations: { fr: {...}, en: {...} }` to
`mediaTranslations: [{ id, language: 'fr', ... }, ...]`.

This is a breaking change for the client decoder. Coordinated with R7
client updates:

- iOS: `APIMessageAttachment` adds `mediaTranslations: [APIMediaTranslation]?`.
  The existing `translations: [String: APIAttachmentTranslation]?` keeps
  working until Phase 5; iOS code is updated to PREFER `mediaTranslations`
  when present (Prisme resolver lookup becomes `mediaTranslations.first(where: { $0.language == preferred })`).
- web: equivalent dual-read.

**Risk: medium.** Coordinated client rollout. Mitigated by:
- Gateway emits BOTH `translations` AND `mediaTranslations` for one
  release cycle (phase 4a), then drops `translations` (phase 4b).
- Client code paths gated on `mediaTranslations !== nil ? ... : translations[lang]`.

### Phase 5 — Deprecate + remove the Json column

After two release cycles with `mediaTranslations` as the source of truth
and zero `translations` reads in the codebase, the `translations: Json?`
column is dropped from the Prisma model. A final maintenance script
clears the column on existing documents (Mongo `$unset` operation).

**Risk: zero.** By Phase 5 nothing reads it.

## Cost / benefit summary

| Metric | Before (Json?) | After (MediaTranslation) | Delta |
|---|---|---|---|
| Read latency (single lang) | ~1ms parse | ~0.2ms indexed lookup | **-80%** |
| Read latency (feed × 30) | ~30ms (30 parses) | ~6ms (1 batched query) | **-80%** |
| Soft-delete one translation | Read-modify-write Json (race) | `UPDATE … SET deletedAt = NOW()` | **race-free** |
| Optimistic adoption | Not possible (no stable ID) | Per-translation `id` | **unblocked** |
| Storage cost | Json column embedded | Separate collection + indexes | **+1.5x storage** |
| Migration cost | — | ~8h backfill, 2 release cycles | **one-time** |

Storage growth is acceptable: translations average 1-3 per attachment,
each row ≈300B uncompressed, well within the existing storage footprint
delta budget.

## Out of scope for R8

- **TranscriptionSegment** stays as Json on `MediaTranslation.segments`.
  Promoting it to its own table is R9 if/when streaming transcription
  needs per-segment indexing.
- **Voice model versioning.** Today `voiceModelId` is a free-form string.
  R10+ could turn it into an FK to a `VoiceModel` table — out of scope
  here.
- **Polymorphic discriminator field.** The schema uses two nullable FKs
  rather than a `parentType: string + parentId: string` pattern. Either
  is acceptable; the nullable-FK approach avoids the discriminator
  drift class of bugs that R1-R5 just spent 5 commits closing.

## Estimated effort

| Phase | Surface | Hours | Risk |
|---|---|---|---|
| 1 (schema) | `prisma/schema.prisma` migration | 2h | zero |
| 2 (dual-write) | 3 gateway services | 8h | low |
| 3 (backfill) | Maintenance script + run | 6h + 8h cron | medium |
| 4 (reads) | 8 gateway routes + iOS SDK + web | 20h | medium |
| 5 (cleanup) | Schema + 1 cleanup script | 4h | zero |
| **Total** | | **~40h gateway + 12h iOS + 8h web** | |

Recommend splitting across two PRs:
- **PR-A** (Phase 1 + 2): schema + dual-write. Lands first, no client coordination.
- **PR-B** (Phase 3 + 4 + 5): backfill + switchover + cleanup. Lands after
  PR-A bakes for one release cycle and the dual-write is observably
  consistent in production.

## Open questions for review

1. Is `MediaTranslation` the right model name, or should it match the
   field name (`MessageAttachmentTranslation` + `PostMediaTranslation`,
   two parallel tables)? Two tables = no nullable FK but doubles the
   index count and the maintenance code. **Recommendation: one polymorphic table.**

2. Does the existing `MessageTranslation` model (the text-translation
   sibling for `Message.content`) want the same migration? It has the
   same shape problem. **Recommendation: yes, R10 covers it.**

3. Should we ship Zod validation on the dual-write payload in Phase 2,
   or stay with the boundary-only validation introduced by R6?
   **Recommendation: yes, validate at every persistence site once R6
   ships — the R8 dual-write doubles the write surface so cheap upfront.**

## Decision required

Approve **PR-A scope** (Phase 1 + 2) and assign owners for the gateway
implementation (~8h) before Phase 3 timing can be planned.
