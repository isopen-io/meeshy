# T8 — Story Background Audio TTS Variants Pipeline

**Date:** 2026-05-01
**Status:** Proposed (awaiting sprint allocation)
**Scope:** Translator service (Python), Gateway service, iOS reader (passive consumer)
**Severity:** P1 (feature wired end-to-end client-side but never produces output)
**Owner:** TBD
**Related audits:** F14 (translation pipeline audit), partially F13

---

## Problem

The `StoryAudioPlayerObject` model and its `backgroundAudioVariants: [StoryAudioVariant]?` field exist on iOS, get serialised by the composer, are read by `StoryCanvasReaderView.startBackgroundAudio()` to pick the right-language variant, and are even broadcast through `toJSON()`. **But nothing on the server produces them.**

iOS reader code (`StoryCanvasReaderView.swift:735-745`):

```swift
func startBackgroundAudio(effects: StoryEffects?, story: StoryItem,
                          preferredLanguages: [String]) {
    guard let effects, let bgAudio = effects.resolvedBackgroundAudio else { return }
    let variants = bgAudio.backgroundAudioVariants ?? []
    let resolvedMediaId: String = preferredLanguages
        .lazy
        .compactMap { lang in variants.first { $0.language == lang }?.postMediaId }
        .first ?? bgAudio.postMediaId  // ← always falls through to the original
}
```

Production behaviour: the `variants` array is **always empty** because no service populates it. Every viewer hears the original audio regardless of their preferred language. The whole TTS-per-language story narration feature is **dead code** end-to-end.

### Why it exists in the model but not in the pipeline

- The composer can **record voice** (`StoryVoiceRecorder.swift`) and **attach background music** (`StoryMusicPicker.swift`).
- Both flows result in a `StoryAudioPlayerObject` referencing a single `PostMedia` (the original audio).
- The model anticipated multi-language variants from day 1; the server-side generation pipeline was never built.

### What we already have on the translator

The Python translator service already has all three required stages, used today by the **message audio pipeline** (`AudioMessagePipeline`):

```
audio_pipeline/
├── audio_message_pipeline.py    # orchestrator (Whisper → NLLB → TTS)
├── transcription_stage.py       # Whisper STT
├── translation_stage.py         # NLLB-200
└── multi_speaker_processor.py   # voice-cloning support
```

And TTS backends (`tts/backends/`): Chatterbox (default), Higgs, XTTS, MMS, VITS — auto-selected by language router.

The work is **not building the ML stack** — it's **wiring a story-specific entry point** that:
1. Triggers per-language variant generation when a story with audio is published
2. Writes back results as new `PostMedia` rows linked to the original audio
3. Updates the story's `storyEffects.audioPlayerObjects[i].backgroundAudioVariants`
4. Notifies viewers in real time so they can play the correct variant immediately

---

## Solution

A new pipeline `story_audio_variants` triggered by gateway upon story creation, mirroring the existing `story_text_object_translation` pattern (T1, shipped in batch 6, commit `9fd14c7`).

The translator transcribes the audio once, translates the transcript into N target languages, and synthesizes TTS per language using the existing voice-router. Each result is uploaded as a new `PostMedia` and posted back to the gateway via a single combined ZMQ event.

---

## Design

### 1. Trigger (gateway side)

`PostService.createPost` already calls `triggerStoryTextTranslation` and `triggerStoryTextObjectTranslation`. Add a third trigger:

```typescript
// services/gateway/src/services/PostService.ts (new method)
private async triggerStoryAudioVariants(
  postId: string,
  storyEffects: StoryEffects,
  authorId: string
): Promise<void> {
  const audioPlayers = storyEffects.audioPlayerObjects ?? [];
  if (audioPlayers.length === 0) return;

  // Resolve audience languages (mirrors `triggerStoryTextObjectTranslation`'s
  // hardcoded list — replaced with audience query in the same follow-up that
  // closes audit T5/F5 if not done by then).
  const targetLanguages = this.getActiveTargetLanguages();
  const log = enhancedLogger.child({ module: 'StoryAudioVariants', postId });

  for (let index = 0; index < audioPlayers.length; index++) {
    const player = audioPlayers[index];
    if (!player.postMediaId) continue;

    // Skip players that already have variants (e.g., re-edit of a story
    // whose audio was already processed). The variant set is keyed by
    // (postMediaId, language) on the server; idempotent retries are safe but
    // wasteful.
    if ((player.backgroundAudioVariants ?? []).length >= targetLanguages.length - 1) {
      log.info('StoryAudioVariants: skipped — already has full variant set', { index });
      continue;
    }

    // Resolve the original audio's URL + source language. Source language is
    // the post's `originalLanguage` (set by composer).
    const sourceLanguage = player.sourceLanguage ?? 'fr';
    const filteredTargets = targetLanguages.filter(l => l !== sourceLanguage);
    if (filteredTargets.length === 0) continue;

    log.info('StoryAudioVariants: enqueueing', {
      audioPlayerIndex: index,
      postMediaId: player.postMediaId,
      sourceLanguage,
      targetCount: filteredTargets.length,
    });

    await this.zmqClient.requestStoryAudioVariants({
      postId,
      authorId,
      audioPlayerIndex: index,
      sourcePostMediaId: player.postMediaId,
      sourceLanguage,
      targetLanguages: filteredTargets,
    });
  }
}
```

`requestStoryAudioVariants` is a new method on `ZmqRequestSender` that emits a single ZMQ frame:

```json
{
  "type": "story_audio_variants",
  "postId": "...",
  "authorId": "...",
  "audioPlayerIndex": 0,
  "sourcePostMediaId": "...",
  "sourceLanguage": "fr",
  "targetLanguages": ["en", "es", "de", "pt", "ar", "zh", "ja", "ko", "ru"],
  "timestamp": 1730000000000
}
```

The request is sent **in parallel with `triggerStoryTextObjectTranslation`** — both are fire-and-forget; the gateway listens for completion events and updates DB independently.

### 2. Translator pipeline (Python)

New handler in `services/translator/src/services/zmq_translation_handler.py`, dispatched alongside the existing `story_text_object_translation`:

```python
elif message_type == 'story_audio_variants':
    await self._handle_story_audio_variants(request_data)
    return
```

New method:

```python
async def _handle_story_audio_variants(self, request_data: dict):
    """
    Generate per-language TTS variants for a story's background audio.

    Pipeline:
        1. Resolve source audio URL → fetch bytes
        2. Transcribe (Whisper) once → text + segments
        3. For each target language:
           a. Translate transcript (NLLB)
           b. Synthesize TTS (TTSService.language_router → Chatterbox/Higgs/etc.)
           c. POST the resulting WAV/MP3 back to gateway as a PostMedia attachment
              (re-uses the existing /api/v1/internal/story-audio-variant route — see §3)
        4. Publish single combined event with [(language, postMediaId)] tuples

    Failure mode: any per-language failure is logged but doesn't abort the others.
    The combined event includes only successful variants.
    """
    post_id = request_data.get('postId')
    audio_player_index = request_data.get('audioPlayerIndex')
    source_post_media_id = request_data.get('sourcePostMediaId')
    source_language = request_data.get('sourceLanguage', 'fr')
    target_languages = request_data.get('targetLanguages', [])
    author_id = request_data.get('authorId')

    if not post_id or audio_player_index is None or not source_post_media_id:
        logger.warning(f"⚠️ [TRANSLATOR] story_audio_variants invalid request: {request_data}")
        return

    # Phase 1: fetch source audio from gateway (signed internal URL)
    try:
        audio_bytes = await self._fetch_post_media_bytes(source_post_media_id, author_id)
    except Exception as e:
        logger.warning(f"⚠️ [TRANSLATOR] story_audio_variants fetch failed: {e}")
        return

    # Phase 2: transcribe once (Whisper)
    try:
        transcription = await self.audio_pipeline.transcribe(
            audio_bytes=audio_bytes,
            source_language=source_language,
        )
    except Exception as e:
        logger.warning(f"⚠️ [TRANSLATOR] story_audio_variants transcription failed: {e}")
        return

    # Phase 3: parallelise per-language pipelines
    variants: list[dict] = []
    sem = asyncio.Semaphore(3)  # cap concurrent TTS jobs to avoid GPU starvation

    async def process_language(lang: str):
        async with sem:
            try:
                # 3a. Translate transcript
                translated = await self.translator.translate(
                    text=transcription.text,
                    source_lang=source_language,
                    target_lang=lang,
                )
                # 3b. Synthesize TTS
                audio_data = await self.tts_service.synthesize(
                    text=translated.text,
                    target_language=lang,
                    # Voice cloning hints from the source if available
                    voice_reference=transcription.voice_profile,
                )
                # 3c. Upload back to gateway
                new_media_id = await self._upload_variant_to_gateway(
                    audio_bytes=audio_data,
                    parent_media_id=source_post_media_id,
                    language=lang,
                    author_id=author_id,
                    post_id=post_id,
                )
                variants.append({"language": lang, "postMediaId": new_media_id})
            except Exception as e:
                logger.warning(
                    f"⚠️ [TRANSLATOR] story_audio_variants lang={lang} failed: {e}"
                )

    await asyncio.gather(*(process_language(l) for l in target_languages))

    # Phase 4: emit combined event
    completed_event = {
        "type": "story_audio_variants_completed",
        "postId": post_id,
        "audioPlayerIndex": audio_player_index,
        "sourcePostMediaId": source_post_media_id,
        "variants": variants,  # [{language, postMediaId}, ...]
        "timestamp": int(time.time() * 1000),
    }
    if self.pub_socket:
        await self.pub_socket.send(json.dumps(completed_event).encode('utf-8'))
        logger.info(
            f"✅ [TRANSLATOR] story_audio_variants_completed: postId={post_id}, "
            f"index={audio_player_index}, variants={len(variants)}"
        )
```

Helpers `_fetch_post_media_bytes` and `_upload_variant_to_gateway` use a new internal-only HTTP route on the gateway (signed, restricted to the translator's IP).

### 3. Gateway internal endpoint

```typescript
// services/gateway/src/routes/posts/audio.ts (add new route)
fastify.post('/posts/internal/story-audio-variant', {
  schema: { /* ... */ },
  preValidation: [internalServiceAuth], // shared HMAC, not user JWT
}, async (request, reply) => {
  const { authorId, postId, parentMediaId, language, audioBytes } = request.body;

  // Quota check: limit total variants per story to prevent abuse if the
  // hardcoded language list grows unexpectedly.
  const existing = await prisma.postMedia.count({
    where: { parentMediaId, type: 'audio_variant' },
  });
  if (existing >= 30) {
    return reply.status(429).send({ error: 'Variant quota exceeded' });
  }

  // Persist as a sibling PostMedia row (no postId yet — links to existing post
  // via parentMediaId).
  const media = await prisma.postMedia.create({
    data: {
      postId,
      uploadedBy: authorId,
      type: 'audio_variant',
      parentMediaId,
      language,
      fileUrl: await uploadToStorage(audioBytes),
      mimeType: 'audio/mpeg',
      duration: await measureDuration(audioBytes),
      isAutoGenerated: true,
    },
  });

  return sendSuccess(reply, { id: media.id });
});
```

Schema additions (Prisma):

```prisma
model PostMedia {
  // ...existing fields...

  /// When this media is a TTS variant of another. Links back to the original
  /// audio that the composer attached. Used for `parentMediaId` quota and to
  /// expire variants when the original is deleted.
  parentMediaId   String?  @db.ObjectId
  parent          PostMedia? @relation("MediaVariants", fields: [parentMediaId], references: [id], onDelete: Cascade)
  variants        PostMedia[] @relation("MediaVariants")

  /// Variant language code (IETF, e.g. "en", "fr-CA"). Only set for `audio_variant` type.
  language        String?

  /// True when generated by the TTS pipeline (vs. uploaded by user).
  isAutoGenerated Boolean  @default(false)

  @@index([parentMediaId, language])
}
```

### 4. Gateway-side ZMQ result handler

New service `StoryAudioVariantsService.ts` modeled on `StoryTextObjectTranslationService.ts`:

```typescript
// services/gateway/src/services/posts/StoryAudioVariantsService.ts
async handleVariantsCompleted(params: {
  postId: string;
  audioPlayerIndex: number;
  sourcePostMediaId: string;
  variants: Array<{ language: string; postMediaId: string }>;
}): Promise<void> {
  const { postId, audioPlayerIndex, variants } = params;

  if (!Number.isInteger(audioPlayerIndex) || audioPlayerIndex < 0 || audioPlayerIndex > 100) {
    log.warn('rejected malformed audioPlayerIndex', { postId, audioPlayerIndex });
    return;
  }
  if (variants.length === 0) {
    log.info('no variants produced — translator pipeline failed silently', { postId });
    return;
  }

  // Validate every variant before interpolating into Mongo dot-notation.
  for (const v of variants) {
    if (!/^[a-z]{2,5}$/.test(v.language)) {
      log.warn('rejected malformed language', { postId, lang: v.language });
      return;
    }
    if (!/^[a-fA-F0-9]{24}$/.test(v.postMediaId)) {
      log.warn('rejected malformed postMediaId', { postId, mediaId: v.postMediaId });
      return;
    }
  }

  // Atomic merge into the existing variants array via Mongo dot-notation +
  // $addToSet semantics. Uses raw command because Prisma can't express
  // "append to nested array deduplicated by `language`".
  const variantsArrayPath = `storyEffects.audioPlayerObjects.${audioPlayerIndex}.backgroundAudioVariants`;

  await (this.prisma as any).$runCommandRaw({
    update: 'Post',
    updates: [{
      q: { _id: { $oid: postId } },
      u: {
        $set: variants.reduce((acc, v) => {
          acc[`${variantsArrayPath}.${v.language}`] = {
            language: v.language,
            postMediaId: v.postMediaId,
            isAutoGenerated: true,
          };
          return acc;
        }, {} as Record<string, unknown>),
      },
    }],
  });

  // Visibility-filtered broadcast (mirrors batch 4's
  // `STORY_TRANSLATION_UPDATED` fix). Viewers re-pick the right variant
  // immediately without a feed refetch.
  const post = await this.prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, visibility: true, visibilityUserIds: true },
  });
  if (!post) return;

  const recipients = await this.resolveBroadcastRecipients(
    post.authorId, post.visibility, post.visibilityUserIds
  );
  for (const userId of recipients) {
    this.io.to(ROOMS.feed(userId)).emit(
      SERVER_EVENTS.STORY_AUDIO_VARIANTS_UPDATED,
      { postId, audioPlayerIndex, variants },
    );
  }
}
```

New shared event:

```typescript
// packages/shared/types/socketio-events.ts
STORY_AUDIO_VARIANTS_UPDATED: 'post:story-audio-variants-updated',
```

```typescript
// packages/shared/types/post.ts
export interface StoryAudioVariantsUpdatedEventData {
  readonly postId: string;
  readonly audioPlayerIndex: number;
  readonly variants: ReadonlyArray<{ language: string; postMediaId: string }>;
}
```

### 5. iOS / web consumers

**iOS** (already wired by current code — no work):
- `StoryCanvasReaderView.startBackgroundAudio()` already iterates `preferredLanguages` and falls back to original. It will start picking up the new variants automatically once the gateway populates them.
- Live updates: subscribe to `post:story-audio-variants-updated` in `SocialSocketManager` (same pattern as batch 4's `STORY_TRANSLATION_UPDATED`). On receipt, patch the cached `StoryGroup` in `StoryViewModel` and notify the `ReaderState` (which restarts background audio with the new variant set).

**Web**: defer. Web composer doesn't generate audio in v1 (web parity batch 11A only renders existing audio). Web reader can subscribe to the event and swap the audio src once 11C's audio rendering is in place.

---

## Implementation Order (sub-batches)

| Batch | Scope | Code | Risk |
|---|---|---|---|
| **T8.1** | Schema additions: `PostMedia.parentMediaId`, `PostMedia.language`, `PostMedia.isAutoGenerated`. Internal HTTP route + auth (`internalServiceAuth` HMAC). Pure DB + plumbing. | ~150 LOC | Bas |
| **T8.2** | Translator handler `_handle_story_audio_variants`. Reuses `audio_pipeline.transcribe`, `translator.translate`, `tts_service.synthesize`. Tested in isolation against a sample WAV. | ~200 Python LOC | Moyen (GPU + TTS edge cases) |
| **T8.3** | Gateway-side: `StoryAudioVariantsService`, ZMQ event handler, Socket.IO broadcast. `triggerStoryAudioVariants` from `PostService.createPost`. | ~180 LOC | Bas |
| **T8.4** | iOS: `SocialSocketManager.storyAudioVariantsUpdated` Combine publisher; `StoryViewModel` cache patch; reader restart on update. | ~80 LOC | Bas |
| **T8.5** | Quotas + observability: per-author rate limit on variant generation (max 5 stories/hour with audio); Prometheus counter for variants generated/failed; opt-out flag in user prefs ("don't generate TTS for my voice") | ~100 LOC | Bas |

Total ≈ 710 LOC across 4 services. Each sub-batch is its own PR.

---

## Testing

### Translator unit tests (`tests/test_story_audio_variants.py`)

```python
@pytest.mark.asyncio
async def test_handle_story_audio_variants_happy_path(handler, mock_audio):
    """Single English source → French + Spanish variants."""
    await handler._handle_story_audio_variants({
        "type": "story_audio_variants",
        "postId": "abc",
        "audioPlayerIndex": 0,
        "sourcePostMediaId": "media123",
        "sourceLanguage": "en",
        "targetLanguages": ["fr", "es"],
        "authorId": "author1",
    })
    published = handler.pub_socket.sent_messages
    assert len(published) == 1
    event = json.loads(published[0])
    assert event["type"] == "story_audio_variants_completed"
    assert event["audioPlayerIndex"] == 0
    assert {v["language"] for v in event["variants"]} == {"fr", "es"}

@pytest.mark.asyncio
async def test_partial_failure_includes_only_successful_variants(handler, ...):
    """One language fails (TTS backend unavailable) — others still publish."""
    handler.tts_service.synthesize = AsyncMock(side_effect=[
        b"audio_fr", RuntimeError("TTS unavailable"), b"audio_de"
    ])
    await handler._handle_story_audio_variants({
        ..., "targetLanguages": ["fr", "es", "de"],
    })
    event = json.loads(handler.pub_socket.sent_messages[0])
    assert {v["language"] for v in event["variants"]} == {"fr", "de"}

@pytest.mark.asyncio
async def test_concurrent_tts_jobs_capped_by_semaphore(handler, ...):
    """8 target languages must not exhaust GPU."""
    handler.tts_service.synthesize = AsyncMock(side_effect=lambda **k: asyncio.sleep(0.5))
    start = time.time()
    await handler._handle_story_audio_variants({
        ..., "targetLanguages": list("abcdefgh"),
    })
    # With sem=3 and 8 jobs of 0.5s each, total ≥ ceil(8/3) * 0.5 = 1.5s
    assert time.time() - start >= 1.4
```

### Gateway integration tests

```typescript
describe('StoryAudioVariantsService.handleVariantsCompleted', () => {
  it('persists variants under the right audioPlayerIndex via dot-notation', async () => {
    await service.handleVariantsCompleted({
      postId, audioPlayerIndex: 1, sourcePostMediaId: 'src',
      variants: [{ language: 'fr', postMediaId: 'fr_media' }],
    });
    const post = await prisma.post.findUnique({ where: { id: postId } });
    const variants = post?.storyEffects?.audioPlayerObjects?.[1]?.backgroundAudioVariants;
    expect(variants).toEqual([{ language: 'fr', postMediaId: 'fr_media', isAutoGenerated: true }]);
  });

  it('rejects malformed language codes (injection attempt)', async () => {
    await service.handleVariantsCompleted({
      postId, audioPlayerIndex: 0, sourcePostMediaId: 'src',
      variants: [{ language: 'fr.$inject', postMediaId: 'media' }],
    });
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.storyEffects).toEqual(originalEffects);
  });

  it('broadcasts to visibility-filtered viewers only', async () => {
    // Author has 2 friends + 1 non-friend. visibility=ONLY [friend1].
    await service.handleVariantsCompleted({ postId, audioPlayerIndex: 0, ... });
    expect(emitToFeed).toHaveBeenCalledWith('feed:friend1', expect.anything());
    expect(emitToFeed).not.toHaveBeenCalledWith('feed:friend2', expect.anything());
    expect(emitToFeed).not.toHaveBeenCalledWith('feed:nonfriend', expect.anything());
  });
});
```

### End-to-end test (manual / scripted)

1. Post a story from iOS with a voice recording in French.
2. Wait ~30s for variants to generate.
3. Open the same story from a second iOS device with `systemLanguage = "en"`.
4. Verify the played audio is the English TTS variant (different waveform than the original).
5. Verify the original audio still plays for the author (preferredLanguages chain falls through to original).
6. Repeat with simulated translator outage → variants empty, fallback to original.

---

## Rollout

1. **T8.1** schema migration (additive, no data move). Deploy + verify `prisma db push` clean.
2. **T8.2** translator: deploy Python service with feature flag `STORY_AUDIO_VARIANTS_ENABLED=false`. Smoke-test handler in isolation via direct ZMQ injection.
3. **T8.3** gateway: deploy with the same flag controlling whether `triggerStoryAudioVariants` actually fires. Off by default in prod, on in staging.
4. **Staging soak** (1 week): post 50 stories with audio; verify variants generate, viewer language switching works, no GPU OOM, no quota breach.
5. **Flip flag** in prod for a 5% canary user cohort.
6. **24h observation**: monitor TTS latency (target P95 < 60s), failure rate (target < 5%), GPU utilization, gateway storage growth.
7. **T8.4** iOS deploy + flag flip to 100%.
8. **T8.5** quotas + per-user opt-out: deploy 2 weeks after 100% rollout once baseline behaviour is established.

---

## Failure modes & mitigations

| Failure | Mitigation |
|---|---|
| Translator GPU OOM on 8+ concurrent TTS jobs | Semaphore cap = 3 in handler; back-pressure via translator pool manager |
| TTS backend (e.g. Chatterbox) crashes on a specific language | Try/except per-language inside `process_language`; partial result publish |
| Network glitch between translator and gateway during upload | Retry once with exponential backoff inside `_upload_variant_to_gateway`; if still fails, drop the variant (logged) |
| User edits the story between request and response → variants reference stale `postMediaId` | Server-side check: when `handleVariantsCompleted` runs, verify the post still has `storyEffects.audioPlayerObjects[index].postMediaId === sourcePostMediaId` before persisting. If mismatch, drop the result |
| User deletes the original audio before variants complete | The `parent` relation has `onDelete: Cascade` — variants are orphaned by Mongo. Translator's upload step then errors with FK violation; logged + dropped |
| Author opts out via T8.5 flag mid-pipeline | Translator never sees the request (gateway gates on the flag at trigger time); no race |
| Storage cost runaway from many languages × many stories | Quota: 30 variants per `parentMediaId` (T8.3); per-author: max 5 audio stories/hour at T8.5 |
| Translator restart loses in-flight tasks | Each request is independent fire-and-forget; the original story stays valid (variants empty until next edit). Author can re-save the story via composer to retrigger |

---

## Out of scope (defer)

- **Voice cloning preservation** — first-pass uses the default TTS voice for each language. A future T8-bis can route through `voice_clone/openvoice_v2.py` to preserve the speaker's timbre across languages. The transcription stage already produces a voice profile (`transcription.voice_profile` in pseudocode above) — it's just not used by the synthesizer yet.
- **Live re-translation when user changes language preferences** — the variants are generated once at publish time. If the gateway later supports more languages, existing stories don't auto-update. Acceptable for v1.
- **Web composer audio recording** — composer-side feature; web v1 (batch 11A shipped) only renders. Web composer audio is its own work item.
- **Reactions broadcast** — already handled in batch 5 (`X6`).
- **Per-language TTS timing alignment with subtitles / waveforms** — current model has `waveformSamples: [Float]` from composer; variants ship with their own waveform. UI rendering of the per-variant waveform is a polish item.

---

## Estimated effort

| Phase | Engineering | DBA / Ops | Calendar |
|---|---|---|---|
| T8.1 (schema + internal route) | 1 day | 0.5 day | 1 day |
| T8.2 (translator handler) | 2 days (incl. GPU profiling) | 0 | 2 days |
| T8.3 (gateway service + broadcast) | 1 day | 0 | 1 day |
| T8.4 (iOS reader hook-up) | 0.5 day | 0 | 0.5 day |
| T8.5 (quotas + opt-out) | 1 day | 0 | 1 day |
| **Total** | **5.5 eng-days + 0.5 ops-day** | | **2 sprints** (with the staging soak between flag flips) |

---

## Acceptance criteria

- [ ] iOS user with `systemLanguage = "en"` opens a French story with voice → hears English TTS narration
- [ ] Original-language viewer (`fr` here) hears the original recording (variant set excludes source)
- [ ] If translator service is offline, story still posts successfully and viewer hears the original
- [ ] No regression on existing `story_text_object_translation` pipeline (T1)
- [ ] `STORY_AUDIO_VARIANTS_UPDATED` event respects visibility (only authorized viewers receive it)
- [ ] PostMedia variant has `parentMediaId`, `language`, `isAutoGenerated: true` set correctly
- [ ] Quota: 31st variant for the same `parentMediaId` rejected with 429
- [ ] Existing tests for `compressVideo`, `triggerStoryTextObjectTranslation` still pass

---

## References

- Audit F14 (translation pipeline): "No pipeline that generates `backgroundAudioVariants`"
- Pattern precedent: T1 (`story_text_object_translation`) — translator handler pattern, commit `9fd14c7` (batch 6)
- Existing audio pipeline: `services/translator/src/services/audio_pipeline/audio_message_pipeline.py`
- TTS backend selection: `services/translator/src/services/tts/language_router.py`
- Visibility-filtered broadcast pattern: `StoryTextObjectTranslationService.resolveBroadcastRecipients` (commit `874f2aa`, batch 4)
- iOS reader consumption: `StoryCanvasReaderView.startBackgroundAudio` (commit `665da9c`, batch 1)
