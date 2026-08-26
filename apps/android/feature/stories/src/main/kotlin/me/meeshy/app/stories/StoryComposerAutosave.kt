package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot

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
 * ## Fidelity gate (this slice)
 *
 * The [StoryComposerDraftSnapshot] round-trips a slide's caption, media and identity but
 * **not** its on-canvas rich content (text/sticker elements, filter, background, canvas
 * pan/zoom, pinned duration). So a draft carrying any of that would restore lossily — a
 * silent partial the user never asked for. This layer refuses that: a deck with rich
 * content is treated as *not yet persistable* — [resolve] purges any stale stored draft
 * (so a cold start never rebuilds a pre-rich version) and writes nothing new. Widening the
 * snapshot to carry rich content, lifting this gate, is a tracked follow-up.
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
     * Whether [deck] is a freshly opened composer: exactly one slide, blank, with no media
     * and no rich content — the only state a stored draft may be restored into.
     */
    fun deckIsPristine(deck: StorySlideDeck): Boolean =
        deck.size == 1 && !deck.hasText && !deck.hasMedia && !deckHasRichContent(deck)

    /**
     * Whether any slide carries on-canvas content this slice's snapshot cannot represent:
     * a text or sticker element, a photo filter, a colour/media background, a pinned
     * duration, or a non-identity canvas transform. Such a deck is not yet persistable.
     */
    fun deckHasRichContent(deck: StorySlideDeck): Boolean =
        deck.slides.any { slide ->
            slide.elements.isNotEmpty() ||
                slide.stickers.isNotEmpty() ||
                slide.filter != null ||
                slide.background != null ||
                slide.backgroundMediaId != null ||
                slide.durationSecondsPin != null ||
                !slide.transform.isIdentity
        }

    private fun purgeOrNone(previous: StoryComposerDraftSnapshot?): StoryDraftPersist =
        if (previous != null) StoryDraftPersist.Clear else StoryDraftPersist.None
}

/** Projects the deck's persistable fields onto a durable snapshot stamped [nowIso]. */
fun StorySlideDeck.toDraftSnapshot(
    visibility: StoryVisibility,
    repostOfId: String?,
    nowIso: String,
): StoryComposerDraftSnapshot = StoryComposerDraftSnapshot(
    slides = slides.map { StoryDraftSlideSnapshot(id = it.id, text = it.text, mediaIds = it.mediaIds) },
    selectedId = selectedId,
    visibility = visibility.wire,
    repostOfId = repostOfId?.takeIf { it.isNotBlank() },
    updatedAt = nowIso,
)

/**
 * Rebuilds a deck from a stored [StoryComposerDraftSnapshot], or `null` when the blob is
 * structurally broken (no slides, or a selection that names no present slide) — the deck
 * invariants would otherwise throw. Only the persistable fields (id / caption / media) are
 * restored; every richer field takes its fresh-slide default.
 */
fun StoryComposerDraftSnapshot.toDeck(): StorySlideDeck? {
    if (!isStructurallyValid) return null
    return StorySlideDeck(
        slides = slides.map { StorySlide(id = it.id, text = it.text, mediaIds = it.mediaIds) },
        selectedId = selectedId,
    )
}
