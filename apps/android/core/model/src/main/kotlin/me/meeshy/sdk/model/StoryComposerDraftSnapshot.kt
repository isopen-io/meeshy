package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The durable form of one slide of an in-progress story composer draft — just the
 * fields this persistence slice round-trips faithfully: the slide's stable [id], its
 * caption [text], and the [mediaIds] attached to it (uploaded ids and offline
 * `cmid` placeholders alike). Richer on-canvas content (text/sticker elements,
 * filters, backgrounds, canvas transform) is deliberately **absent** here — a draft
 * that carries any of it is not yet persistable (see [me.meeshy] `StoryComposerAutosave`),
 * so a restore from this snapshot is never lossy.
 *
 * Every field is a primitive or a list of primitives, so the snapshot serialises
 * with no deep object graph and no polymorphic serialiser — the deliberate cost of
 * keeping this first cut thin and its round-trip trivially total.
 */
@Serializable
data class StoryDraftSlideSnapshot(
    val id: String,
    val text: String = "",
    val mediaIds: List<String> = emptyList(),
) {
    /** True once the slide carries content worth restoring: a caption or attached media. */
    val hasContent: Boolean get() = text.isNotBlank() || mediaIds.isNotEmpty()
}

/**
 * The durable snapshot of the whole story composer — the Android building block behind
 * iOS `StoryComposerDraft` (its `Codable` `{slides, visibilityPreference}` UserDefaults
 * form) and `StoryDraftStore.save(slides:visibility:)`. A stateless value: the durable
 * [me.meeshy.sdk] `StoryComposerDraftStore` owns the bytes; the *when to save vs purge*
 * product rule lives in `:feature:stories` `StoryComposerAutosave`.
 *
 * The composer is a single draft (not keyed like a per-conversation chat draft), so the
 * store holds at most one of these. [visibility] is the wire string of the composer's
 * audience selection; [repostOfId] carries a repost link when the draft reposts another
 * story (blank/absent otherwise); [updatedAt] is an ISO timestamp for diagnostics and is
 * never part of the content identity ([sameContentAs]).
 *
 * Every field is defaulted so a legacy/partial persisted blob decodes rather than
 * throwing; a structurally broken blob (no slides, or a [selectedId] that names no
 * present slide) is reported by [isStructurallyValid] and treated as "no draft" by the
 * consumer instead of crashing the composer.
 */
@Serializable
data class StoryComposerDraftSnapshot(
    val slides: List<StoryDraftSlideSnapshot> = emptyList(),
    val selectedId: String = "",
    val visibility: String = DEFAULT_VISIBILITY,
    val repostOfId: String? = null,
    val updatedAt: String? = null,
) {
    /**
     * Whether this snapshot describes a composer that could actually be rebuilt: it holds
     * at least one slide **and** its [selectedId] names one of them. A blob failing this
     * is corrupt/legacy and must be treated as "no stored draft" (never rebuilt into a deck).
     */
    val isStructurallyValid: Boolean
        get() = slides.isNotEmpty() && slides.any { it.id == selectedId }

    /**
     * Whether the snapshot is worth restoring — it is structurally valid **and** at least
     * one slide carries content (a caption or attached media). A valid-but-empty snapshot
     * (a single blank slide) restores nothing, so it never clobbers a freshly opened composer.
     */
    val isWorthRestoring: Boolean
        get() = isStructurallyValid && slides.any { it.hasContent }

    /**
     * Content equality that ignores [updatedAt]: two snapshots are the same *draft* when
     * their slides, selection, audience and repost link match, whatever their timestamps.
     * The autosave decision uses this so re-saving an unchanged composer writes nothing.
     */
    fun sameContentAs(other: StoryComposerDraftSnapshot): Boolean =
        slides == other.slides &&
            selectedId == other.selectedId &&
            visibility == other.visibility &&
            repostOfId == other.repostOfId

    companion object {
        /** The audience a fresh draft defaults to — parity with the composer's `StoryVisibility.PUBLIC`. */
        const val DEFAULT_VISIBILITY: String = "PUBLIC"
    }
}
