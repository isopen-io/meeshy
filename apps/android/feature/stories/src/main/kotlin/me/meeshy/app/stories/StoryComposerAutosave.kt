package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftFilterSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryDraftTextElementSnapshot
import me.meeshy.sdk.model.StoryDraftTransformSnapshot

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
 * ## Fidelity gate
 *
 * The [StoryComposerDraftSnapshot] round-trips a slide's caption, media, identity, its
 * 9:16 canvas pan/zoom [StorySlide.transform], its photo [StorySlide.filter], its pinned
 * [StorySlide.durationSecondsPin], its colour/media [StorySlide.background] /
 * [StorySlide.backgroundMediaId] / [StorySlide.backgroundLoop] and its on-canvas text
 * [StorySlide.elements] — but **not** its remaining on-canvas rich content (sticker
 * elements). So a draft carrying a sticker would restore lossily — a silent partial the
 * user never asked for. This layer refuses that: a deck with still-unrepresentable rich
 * content is treated as *not yet persistable* — [resolve] purges any stale stored draft (so
 * a cold start never rebuilds a pre-rich version) and writes nothing new. Widening the
 * snapshot to carry stickers too, lifting this gate to nothing, is a tracked follow-up.
 */
object StoryComposerAutosave {

    /**
     * The persistence action for the current composer [deck] / [visibility] / [repostOfId],
     * given the [previous] stored draft. Rules, in order:
     *
     * - **Rich content present** → the snapshot cannot represent it faithfully:
     *   [StoryDraftPersist.Clear] over any stored draft (never keep a stale partial),
     *   else [StoryDraftPersist.None].
     * - **No restorable content** (no slide carries a caption or media) → the same:
     *   [StoryDraftPersist.Clear] over a stored draft, else [StoryDraftPersist.None].
     * - **Restorable content, unchanged** from [previous] → [StoryDraftPersist.None].
     * - **Restorable content, changed** → [StoryDraftPersist.Save] with a fresh snapshot
     *   stamped [nowIso].
     */
    fun resolve(
        deck: StorySlideDeck,
        visibility: StoryVisibility,
        repostOfId: String?,
        nowIso: String,
        previous: StoryComposerDraftSnapshot?,
    ): StoryDraftPersist {
        if (deckHasRichContent(deck)) return purgeOrNone(previous)
        val snapshot = deck.toDraftSnapshot(visibility, repostOfId, nowIso)
        if (!snapshot.isWorthRestoring) return purgeOrNone(previous)
        if (previous != null && previous.sameContentAs(snapshot)) return StoryDraftPersist.None
        return StoryDraftPersist.Save(snapshot)
    }

    /**
     * The snapshot to seed when the composer opens, or `null` to leave it untouched. A
     * stored draft is restored only when the composer is [deckIsPristine] — a single blank
     * slide with no content — so a restore never clobbers work already begun (the load is
     * asynchronous and may resolve after the first edit). A `null`, corrupt, or
     * content-empty [stored] draft is ignored (returns `null`).
     */
    fun restore(stored: StoryComposerDraftSnapshot?, deckIsPristine: Boolean): StoryComposerDraftSnapshot? {
        if (!deckIsPristine) return null
        if (stored == null || !stored.isWorthRestoring) return null
        return stored
    }

    /**
     * Whether [deck] is a freshly opened composer: exactly one slide, blank, with no media,
     * no rich content, an identity canvas transform, no photo filter, no pinned duration, no
     * colour/media backdrop and no on-canvas text element — the only state a stored draft may
     * be restored into. The transform, filter, duration pin, background and text elements are
     * checked explicitly here (all are persistable, so no longer part of [deckHasRichContent])
     * so a silently panned canvas, a picked filter, a pinned duration, a chosen backdrop or an
     * added text element still counts as touched and a restore never clobbers it. ([backgroundLoop]
     * needs no check: it can only differ from its `true` default once a
     * [StorySlide.backgroundMediaId] is designated, which this predicate already rejects.)
     */
    fun deckIsPristine(deck: StorySlideDeck): Boolean =
        deck.size == 1 && !deck.hasText && !deck.hasMedia && !deckHasRichContent(deck) &&
            deck.slides.all {
                it.transform.isIdentity && it.filter == null && it.durationSecondsPin == null &&
                    it.background == null && it.backgroundMediaId == null && it.elements.isEmpty()
            }

    /**
     * Whether any slide carries on-canvas content the snapshot cannot represent: a sticker
     * element. Such a deck is not yet persistable. The 9:16 canvas transform, the photo
     * filter, the pinned duration, the colour/media background and the on-canvas text
     * elements are **not** here — all are now round-tripped by the snapshot
     * ([StorySlide.transform] ↔ [StoryDraftTransformSnapshot];
     * [StorySlide.filter]/[StorySlide.filterIntensity] ↔ [StoryDraftFilterSnapshot];
     * [StorySlide.durationSecondsPin] ↔ [StoryDraftSlideSnapshot.durationSecondsPin];
     * [StorySlide.background] wire string / [StorySlide.backgroundMediaId] /
     * [StorySlide.backgroundLoop] ↔ [StoryDraftSlideSnapshot.background]/[StoryDraftSlideSnapshot.backgroundMediaId]/[StoryDraftSlideSnapshot.backgroundLoop];
     * [StorySlide.elements] ↔ [StoryDraftSlideSnapshot.elements]).
     */
    fun deckHasRichContent(deck: StorySlideDeck): Boolean =
        deck.slides.any { slide -> slide.stickers.isNotEmpty() }

    private fun purgeOrNone(previous: StoryComposerDraftSnapshot?): StoryDraftPersist =
        if (previous != null) StoryDraftPersist.Clear else StoryDraftPersist.None
}

/** Projects the deck's persistable fields onto a durable snapshot stamped [nowIso]. */
fun StorySlideDeck.toDraftSnapshot(
    visibility: StoryVisibility,
    repostOfId: String?,
    nowIso: String,
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
        )
    },
    selectedId = selectedId,
    visibility = visibility.wire,
    repostOfId = repostOfId?.takeIf { it.isNotBlank() },
    updatedAt = nowIso,
)

/**
 * Rebuilds a deck from a stored [StoryComposerDraftSnapshot], or `null` when the blob is
 * structurally broken (no slides, or a selection that names no present slide) — the deck
 * invariants would otherwise throw. The persistable fields (id / caption / media / canvas
 * transform / photo filter / pinned duration / colour+media background) are restored; every
 * still-gated richer field (sticker elements) takes its fresh-slide default. A persisted
 * [StoryDraftSlideSnapshot.background] wire string is parsed by the tolerant
 * [StoryBackgroundValue.parse] (a malformed value decays to a solid colour, never throws), and
 * each persisted text element is rebuilt by the tolerant [toTextElement] (unknown enum names /
 * an unusable backing decay to the element's own defaults), so a corrupt blob never breaks the
 * restore.
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
                filter = it.filter?.filter,
                filterIntensity = it.filter?.intensity ?: StoryFilterMatrix.DEFAULT_INTENSITY,
                durationSecondsPin = it.durationSecondsPin,
                background = it.background?.let(StoryBackgroundValue::parse),
                backgroundMediaId = it.backgroundMediaId,
                backgroundLoop = it.backgroundLoop,
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
        fadeIn = fade.inSeconds,
        fadeOut = fade.outSeconds,
        startSeconds = timing.startSeconds,
        durationSeconds = timing.durationSeconds,
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
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
        fade = StoryTextFade(inSeconds = fadeIn, outSeconds = fadeOut),
        timing = StoryElementTiming(startSeconds = startSeconds, durationSeconds = durationSeconds),
        x = x,
        y = y,
        scale = scale,
        rotationDeg = rotationDeg,
    )
