package me.meeshy.app.stories

import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftAnnotations
import me.meeshy.sdk.model.StoryDraftFilterSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryDraftStickerElementSnapshot
import me.meeshy.sdk.model.StoryDraftTextElementSnapshot
import me.meeshy.sdk.model.StoryDraftTransformSnapshot
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import me.meeshy.sdk.model.scene.StoryElementTiming
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFade
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextOutline

/** The persistence action a composer change implies for its single durable draft. */
sealed interface StoryDraftPersist {
    /** Write [snapshot] to the durable store (the composer holds restorable content). */
    data class Save(val snapshot: StoryComposerDraftSnapshot) : StoryDraftPersist

    /** Purge the stored draft (the composer went empty, or its content is no longer persistable). */
    data object Clear : StoryDraftPersist

    /** Nothing to write — the store already matches the composer (idempotent). */
    data object None : StoryDraftPersist
}

/**
 * Pure decision layer for the story composer's draft auto-save/restore — the Android
 * port of iOS `StoryComposerDraft` persistence (`StoryDraftStore.save`/`load` + the
 * `resetLocalState`/`isEmpty` purge rules). A stateless building block: the durable
 * [me.meeshy.sdk.story.StoryComposerDraftStore] owns bytes; this owns the *when* —
 * kept out of the Composable and off the ViewModel so every branch stays JVM-testable.
 *
 * ## Full-fidelity round-trip
 *
 * The [StoryComposerDraftSnapshot] now round-trips **every** dimension of a composer slide:
 * its caption, media and identity, its 9:16 canvas pan/zoom [StorySlide.transform], its photo
 * [StorySlide.filter], its pinned [StorySlide.durationSecondsPin], its colour/media
 * [StorySlide.background] / [StorySlide.backgroundMediaId] / [StorySlide.backgroundLoop], its
 * on-canvas text [StorySlide.elements] and its on-canvas [StorySlide.stickers]. There is no
 * longer any rich content the snapshot cannot represent, so the historical "not yet
 * persistable" fidelity gate — which purged a stale draft the moment a deck carried
 * unrepresentable content — has been **retired** rather than left as a constant-false dead
 * branch: [resolve] always projects a snapshot and decides purely on whether it is
 * [StoryComposerDraftSnapshot.isWorthRestoring] and changed.
 *
 * One dimension is *not yet* full-fidelity: [StorySlide.strokes] (the drawing tool's
 * freehand layer) has no counterpart on [StoryDraftSlideSnapshot] — that type lives in
 * `:core:model`, outside this module. A drawn stroke therefore survives a slide switch,
 * a config change, and publish (it rides `StoryEffects.drawingStrokes`), but not a
 * composer close/reopen or process death — it is silently dropped on restore rather than
 * corrupting anything. [deckIsPristine] still treats a slide carrying strokes as touched,
 * so a late-resolving restore can never clobber an in-progress drawing. Closing the gap
 * needs a `strokes` field on `StoryDraftSlideSnapshot`/`StoryComposerDraftSnapshot`
 * (`:core:model`) plus the two mirror functions below.
 */
object StoryComposerAutosave {

    /**
     * The persistence action for the current composer [deck] / [visibility] / [repostOfId],
     * given the [previous] stored draft. Rules, in order:
     *
     * - **No restorable content, but a slide carries [StorySlide.strokes]** (a drawing —
     *   content that exists but that [StoryComposerDraftSnapshot] cannot yet represent, see
     *   the class doc) → [StoryDraftPersist.None]. A stroke-only deck must never resolve to
     *   [StoryDraftPersist.Clear]: that would erase whatever [previous] draft is already
     *   stored to make room for a snapshot that, structurally, has nothing to save.
     * - **No restorable content at all** (no slide carries a caption, media, a publishable
     *   text element / sticker, *or* a stroke) → [StoryDraftPersist.Clear] over a stored
     *   draft, else [StoryDraftPersist.None]. A stored draft awaiting its publication is not
     *   the composer's to purge (#13417): only its confirmation or its discard removes it.
     * - **Restorable content, unchanged** from [previous] → [StoryDraftPersist.None].
     * - **Restorable content, changed** → [StoryDraftPersist.Save] with a fresh snapshot
     *   stamped [nowIso].
     *
     * A session that did not make the stored draft its own ([mayOverwriteStored] false — a door that
     * seeded its matter) writes nothing over it, whatever the composer holds.
     */
    fun resolve(
        deck: StorySlideDeck,
        visibility: StoryVisibility,
        repostOfId: String?,
        nowIso: String,
        previous: StoryComposerDraftSnapshot?,
        visibilityUserIds: List<String> = emptyList(),
        annotations: StoryDraftAnnotations = StoryDraftAnnotations(),
        mayOverwriteStored: Boolean = true,
    ): StoryDraftPersist {
        if (!mayOverwriteStored && previous != null) return StoryDraftPersist.None
        val snapshot = deck.toDraftSnapshot(visibility, repostOfId, nowIso, visibilityUserIds, annotations)
        if (!snapshot.isWorthRestoring) {
            val hasUnrepresentableContent = deck.slides.any { it.strokes.isNotEmpty() }
            return if (hasUnrepresentableContent) StoryDraftPersist.None else purgeOrNone(previous)
        }
        if (previous != null && previous.sameContentAs(snapshot)) return StoryDraftPersist.None
        return StoryDraftPersist.Save(snapshot)
    }

    /**
     * Les envois durables que le brouillon [previous] nommait et que [kept] ne nomme plus (#13621) : un brouillon
     * rouvert (#13500) garde par leur `cmid` les envois épuisés de sa publication ; l'abandonner (ou en retirer le
     * média) sans eux laissait la ligne et ses octets jusqu'à la déconnexion. Un brouillon qui attend sa publication
     * ne libère rien : ses lignes sont celles de la publication.
     */
    fun orphanedUploads(previous: StoryComposerDraftSnapshot?, kept: StoryComposerDraftSnapshot?): Set<String> {
        if (previous == null || previous.isAwaitingPublication) return emptySet()
        return previous.uploadCmids() - kept?.uploadCmids().orEmpty()
    }

    /** Les envois durables que [snapshot] nomme par leur `cmid`. */
    fun namedUploads(snapshot: StoryComposerDraftSnapshot?): Set<String> = snapshot?.uploadCmids().orEmpty()

    private fun StoryComposerDraftSnapshot.uploadCmids(): Set<String> =
        slides.flatMap { slide -> slide.mediaIds + listOfNotNull(slide.backgroundMediaId) }
            .filterTo(mutableSetOf(), OutboxIds::isCmid)

    /**
     * The snapshot to seed when the composer opens, or `null` to leave it untouched. A
     * stored draft is restored only when the composer is [deckIsPristine] — a single blank
     * slide with no content — so a restore never clobbers work already begun (the load is
     * asynchronous and may resolve after the first edit). A `null`, corrupt, or
     * content-empty [stored] draft is ignored (returns `null`), and so is a draft awaiting the
     * confirmation of its publication (#13417): it is already on its way, restoring it would
     * publish it twice. A composer opened by a door that brings its own matter (a repost of someone
     * else's story, #13430) restores nothing either: the stored draft is the author's own work and
     * stays on the device, untouched, for the next plain opening (iOS `preservesStoredDraft`).
     */
    fun restore(
        stored: StoryComposerDraftSnapshot?,
        deckIsPristine: Boolean,
        seededByDoor: Boolean = false,
    ): StoryComposerDraftSnapshot? {
        if (!deckIsPristine || seededByDoor) return null
        if (stored == null || !stored.isWorthRestoring || stored.isAwaitingPublication) return null
        return stored
    }

    /**
     * Whether [deck] is a freshly opened composer: exactly one slide, blank, with no media,
     * an identity canvas transform, no photo filter, no pinned duration, no colour/media
     * backdrop, no on-canvas text element and no sticker — the only state a stored draft may
     * be restored into. Every one of these is persistable, so each is checked explicitly here:
     * a silently panned canvas, a picked filter, a pinned duration, a chosen backdrop, an added
     * text element or an added sticker still counts as touched and a restore never clobbers it.
     * ([backgroundLoop] needs no check: it can only differ from its `true` default once a
     * [StorySlide.backgroundMediaId] is designated, which this predicate already rejects.)
     */
    fun deckIsPristine(deck: StorySlideDeck): Boolean =
        deck.size == 1 && !deck.hasText && !deck.hasMedia &&
            deck.slides.all {
                it.transform.isIdentity && it.filter == null && it.durationSecondsPin == null &&
                    it.background == null && it.backgroundMediaId == null &&
                    it.elements.isEmpty() && it.stickers.isEmpty() && it.strokes.isEmpty() && it.audio.isEmpty() &&
                    it.frame.isNeutral && it.places.isEmpty()
            }

    private fun purgeOrNone(previous: StoryComposerDraftSnapshot?): StoryDraftPersist =
        if (previous != null && !previous.isAwaitingPublication) StoryDraftPersist.Clear else StoryDraftPersist.None
}

/** Projects the deck's persistable fields onto a durable snapshot stamped [nowIso]. */
fun StorySlideDeck.toDraftSnapshot(
    visibility: StoryVisibility,
    repostOfId: String?,
    nowIso: String,
    visibilityUserIds: List<String> = emptyList(),
    annotations: StoryDraftAnnotations = StoryDraftAnnotations(),
): StoryComposerDraftSnapshot = StoryComposerDraftSnapshot(
    slides = slides.map {
        StoryDraftSlideSnapshot(
            id = it.id,
            text = it.text,
            mediaIds = it.mediaIds,
            transform = it.transform.toDraftSnapshot(),
            filter = it.toFilterSnapshot(),
            durationSecondsPin = it.durationSecondsPin,
            background = it.background?.serialized(),
            backgroundMediaId = it.backgroundMediaId,
            backgroundLoop = it.backgroundLoop,
            elements = it.elements.map { element -> element.toDraftSnapshot() },
            stickers = it.stickers.map { sticker -> sticker.toDraftSnapshot() },
            audio = it.audio,
            fitMode = it.frame.fitMode,
            backdrop = it.frame.backdrop,
            opening = it.frame.opening?.let(SceneFrame::wire),
            closing = it.frame.closing?.let(SceneFrame::wire),
            soundSources = it.soundSources,
            placedMedia = it.placedMedia.map(StoryPlacedMedia::toDraftSnapshot),
            backgroundAdjustments = it.backgroundAdjustments,
            places = it.places,
        )
    },
    selectedId = selectedId,
    visibility = visibility.wire,
    repostOfId = repostOfId?.takeIf { it.isNotBlank() },
    visibilityUserIds = visibilityUserIds,
    annotations = annotations,
    updatedAt = nowIso,
)

/**
 * Rebuilds a deck from a stored [StoryComposerDraftSnapshot], or `null` when the blob is
 * structurally broken (no slides, or a selection that names no present slide) — the deck
 * invariants would otherwise throw. Every persistable field (id / caption / media / canvas
 * transform / photo filter / pinned duration / colour+media background / text elements /
 * stickers) is restored. A persisted [StoryDraftSlideSnapshot.background] wire string is
 * parsed by the tolerant [StoryBackgroundValue.parse] (a malformed value decays to a solid
 * colour, never throws); each persisted text element is rebuilt by the tolerant
 * [toTextElement] (unknown enum names / an unusable backing decay to the element's own
 * defaults); each persisted sticker is rebuilt by [toStickerElement] and re-normalised, so a
 * corrupt blob never breaks the restore.
 */
fun StoryComposerDraftSnapshot.toDeck(): StorySlideDeck? {
    if (!isStructurallyValid) return null
    return StorySlideDeck(
        slides = slides.map {
            StorySlide(
                id = it.id,
                text = it.text,
                mediaIds = it.mediaIds,
                transform = it.transform.toCanvasTransform(),
                elements = it.elements.map { element -> element.toTextElement() },
                stickers = it.stickers.map { sticker -> sticker.toStickerElement() },
                filter = it.filter?.filter,
                filterIntensity = it.filter?.intensity ?: StoryFilterMatrix.DEFAULT_INTENSITY,
                durationSecondsPin = it.durationSecondsPin,
                background = it.background?.let(StoryBackgroundValue::parse),
                backgroundMediaId = it.backgroundMediaId,
                backgroundLoop = it.backgroundLoop,
                audio = it.audio,
                soundSources = it.soundSources.filter { (id, seconds) -> seconds.isFinite() && seconds > 0f && it.audio.any { track -> track.id == id } },
                placedMedia = it.placedMedia.map(StoryPlacedMedia::from).filter { placed -> placed.mediaId in it.mediaIds },
                backgroundAdjustments = it.backgroundAdjustments?.takeIf { adjustments -> !adjustments.isNeutral && it.backgroundMediaId != null },
                places = it.places,
                frame = SceneFrame(
                    fitMode = it.fitMode,
                    backdrop = it.backdrop,
                    opening = SceneFrame.parseTransition(it.opening),
                    closing = SceneFrame.parseTransition(it.closing),
                ),
            )
        },
        selectedId = selectedId,
    )
}

/**
 * The durable form of a canvas transform — `null` when the framing is the identity (never
 * panned or zoomed), so a fresh slide never bloats the snapshot with the default triple.
 */
private fun StoryCanvasTransform.toDraftSnapshot(): StoryDraftTransformSnapshot? =
    if (isIdentity) null
    else StoryDraftTransformSnapshot(scale = scale, offsetX = offsetX, offsetY = offsetY)

/**
 * Rebuilds a canvas transform from its durable form — `null` (no persisted framing) becomes
 * the identity, the inverse of [toDraftSnapshot]. The values are seeded verbatim; the deck's
 * own gestures re-clamp against a freshly measured canvas on the next interaction.
 */
private fun StoryDraftTransformSnapshot?.toCanvasTransform(): StoryCanvasTransform =
    this?.let { StoryCanvasTransform(scale = it.scale, offsetX = it.offsetX, offsetY = it.offsetY) }
        ?: StoryCanvasTransform.IDENTITY

/**
 * The durable form of a slide's photo filter — `null` when no filter is set, so a fresh
 * slide never persists an intensity that tints nothing. When a filter *is* set its
 * [StorySlide.filterIntensity] rides along, since strength is only meaningful with a
 * filter to blend.
 */
private fun StorySlide.toFilterSnapshot(): StoryDraftFilterSnapshot? =
    filter?.let { StoryDraftFilterSnapshot(filter = it, intensity = filterIntensity) }

/**
 * Projects an on-canvas [StoryTextElement] onto its flat, primitive-only durable form. The
 * three enums ride as their Kotlin `.name` (the inverse [toTextElement] resolves them back,
 * tolerant to an unknown name); the sealed [StoryTextBackground] rides as its already-wire
 * [me.meeshy.sdk.model.StoryTextBackgroundStyle] via the single-source [StoryTextBackground.toStyleWire]
 * (so the tagged-union encoding is never re-spelled here); the outline / fade / timing pairs
 * and the position/scale/rotation ride verbatim as scalars.
 */
private fun StoryTextElement.toDraftSnapshot(): StoryDraftTextElementSnapshot =
    StoryDraftTextElementSnapshot(
        id = id,
        text = text,
        style = style.name,
        color = color,
        align = align.name,
        size = size.name,
        background = background.toStyleWire(),
        outlineWidth = outline.width,
        outlineColor = outline.color,
        frameShape = frame.shape.wire,
        framePaddingScale = frame.paddingScale,
        frameBorderWidth = frame.borderWidth,
        frameBorderColor = frame.borderColor,
        sourceLanguage = sourceLanguage,
        fadeIn = fade.inSeconds,
        fadeOut = fade.outSeconds,
        startSeconds = timing.startSeconds,
        durationSeconds = timing.durationSeconds,
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
        referenceUserId = referenceUserId,
    )

/**
 * Rebuilds an on-canvas [StoryTextElement] from its durable form, the inverse of
 * [toDraftSnapshot]. Decodes tolerantly, mirroring the rest of the story restore path: a blank
 * or unknown enum [StoryDraftTextElementSnapshot.style]/[StoryDraftTextElementSnapshot.align]/[StoryDraftTextElementSnapshot.size]
 * name resolves to the element's own default rather than throwing; a blank [StoryDraftTextElementSnapshot.color]
 * falls back to [StoryTextElement.DEFAULT_COLOR]; the backing is reconstructed by the
 * single-source [StoryTextBackground.resolve] (so a Solid with no usable hex, an unknown type or
 * a bad glass radius decays exactly as the reader's decoder does). Position/scale/rotation are
 * seeded verbatim — the deck's own gestures re-clamp against a freshly measured canvas.
 */
private fun StoryDraftTextElementSnapshot.toTextElement(): StoryTextElement =
    StoryTextElement(
        id = id,
        text = text,
        style = StoryTextStyle.entries.firstOrNull { it.name == style } ?: StoryTextStyle.BOLD,
        color = color.ifBlank { StoryTextElement.DEFAULT_COLOR },
        align = StoryTextAlign.entries.firstOrNull { it.name == align } ?: StoryTextAlign.CENTER,
        size = StoryTextSize.entries.firstOrNull { it.name == size } ?: StoryTextSize.DEFAULT,
        background = StoryTextBackground.resolve(backgroundStyle = background, textBg = null),
        outline = StoryTextOutline(width = outlineWidth, color = outlineColor),
        frame = StoryTextFrame(
            shape = StoryTextFrameShape.fromWire(frameShape),
            paddingScale = framePaddingScale,
            borderWidth = frameBorderWidth,
            borderColor = frameBorderColor,
        ),
        sourceLanguage = sourceLanguage,
        fade = StoryTextFade(inSeconds = fadeIn, outSeconds = fadeOut),
        timing = StoryElementTiming(startSeconds = startSeconds, durationSeconds = durationSeconds),
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
        referenceUserId = referenceUserId,
    )

/**
 * Projects an on-canvas [StoryStickerElement] onto its flat, primitive-only durable form.
 * Thinner than a text element — no enums, no backing, no outline/fade/timing — so every
 * field (the [StoryStickerElement.emoji] glyph and the normalised position/scale/rotation)
 * rides verbatim as a scalar.
 */
private fun StoryStickerElement.toDraftSnapshot(): StoryDraftStickerElementSnapshot =
    StoryDraftStickerElementSnapshot(
        id = id,
        emoji = emoji,
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
        startSeconds = timing.startSeconds,
        durationSeconds = timing.durationSeconds,
    )

/**
 * Rebuilds an on-canvas [StoryStickerElement] from its durable form, the inverse of
 * [toDraftSnapshot]. The scalars are seeded verbatim and then [StoryStickerElement.normalised]
 * pulls any out-of-range persisted position/scale/rotation back into the canvas, mirroring the
 * tolerant decode of the rest of the story restore path — a corrupt blob never breaks the
 * restore.
 */
private fun StoryDraftStickerElementSnapshot.toStickerElement(): StoryStickerElement =
    StoryStickerElement(
        id = id,
        emoji = emoji,
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
        timing = me.meeshy.sdk.model.scene.StoryElementTiming(startSeconds, durationSeconds),
    ).normalised()

/** What the composer's draft attaches beside its slides, in the durable form (#13451). */
fun StoryComposerDraft.annotations(): StoryDraftAnnotations = StoryDraftAnnotations(
    mentions = mentions,
    mediaAlt = mediaAlt,
    mediaCaption = mediaCaption,
    allowSoundExtraction = allowSoundExtraction,
)

/** The draft with [annotations] put back (restore, reopening). */
fun StoryComposerDraft.withAnnotations(annotations: StoryDraftAnnotations): StoryComposerDraft = copy(
    mentions = annotations.mentions,
    mediaAlt = annotations.mediaAlt,
    mediaCaption = annotations.mediaCaption,
    allowSoundExtraction = annotations.allowSoundExtraction,
)
