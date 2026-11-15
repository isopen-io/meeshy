package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryComposerDraftSnapshot

/**
 * The result of reconciling a restored composer draft against the media that is
 * still actually available — the cleaned [snapshot] plus what the loss means for
 * the UI.
 *
 * A persisted [StoryComposerDraftSnapshot] carries only media **ids**, not the
 * bytes or the uploaded records behind them. Between saving the draft and
 * restoring it the backing content can vanish: an offline upload placeholder whose
 * durable blob was swept, an upload the user discarded, a chain abandoned. Rebuilding
 * the deck from such a snapshot verbatim would resurrect dangling ids — a slide that
 * renders a broken tile or tries to publish media that is gone. This value is the
 * safe form to seed instead.
 *
 * @property snapshot the draft with every unavailable media id removed from its
 *   slides (order of the surviving ids preserved); no slide is dropped, so its
 *   `selectedId` still names a present slide and the deck invariants hold.
 * @property lostMediaIds the removed ids, in first-seen slide-then-position order,
 *   deduplicated — the count the composer surfaces ("some media couldn't be restored").
 * @property recaptureSlideIds the ids of slides that the loss emptied of **all**
 *   content (no caption and no surviving media) — the strongest re-capture prompt:
 *   a slide left blank purely because its only media disappeared.
 */
data class StoryDraftMediaReconciliation(
    val snapshot: StoryComposerDraftSnapshot,
    val lostMediaIds: List<String>,
    val recaptureSlideIds: List<String>,
) {
    /** Whether the reconciliation removed anything — the trigger for a restore-loss notice. */
    val hasLoss: Boolean get() = lostMediaIds.isNotEmpty()
}

/**
 * Pure decision layer that strips a restored draft of media whose backing content is
 * gone — the safety net the [StoryComposerAutosave] restore seam made reachable. It
 * decides *what to drop*; the caller supplies *what is available* (an offline
 * placeholder resolves against the durable blob store, a server id is available
 * server-side) and *what to do with the notice*.
 *
 * Stateless and synchronous: availability is a plain predicate the caller has already
 * resolved, so every branch stays JVM-testable off the Android/IO thread.
 */
object StoryDraftMediaReconciler {

    /**
     * Reconciles [snapshot] against [isAvailable], returning the cleaned snapshot and
     * what was lost. Rules:
     *
     * - Each slide keeps only its available media ids, in their original order; every
     *   id for which [isAvailable] is `false` is removed and reported in [lostMediaIds].
     * - No slide is ever removed — a slide emptied by the loss stays (blank), so the
     *   deck's "at least one slide" / valid-selection invariants hold untouched and the
     *   composer can prompt a re-capture in place. Such a slide's id is reported in
     *   [recaptureSlideIds] (it had media, lost all of it, and carries no caption).
     * - When nothing is unavailable the snapshot is returned unchanged (content-equal),
     *   with empty loss lists.
     */
    fun reconcile(
        snapshot: StoryComposerDraftSnapshot,
        isAvailable: (String) -> Boolean,
    ): StoryDraftMediaReconciliation {
        val lost = LinkedHashSet<String>()
        val recapture = mutableListOf<String>()
        val cleanedSlides = snapshot.slides.map { slide ->
            val kept = slide.mediaIds.filter { id -> isAvailable(id) }
            val dropped = slide.mediaIds.filterNot { id -> isAvailable(id) }
            lost.addAll(dropped)
            val emptiedByLoss = dropped.isNotEmpty() && kept.isEmpty() && slide.text.isBlank()
            if (emptiedByLoss) recapture.add(slide.id)
            if (kept.size == slide.mediaIds.size) slide else slide.copy(mediaIds = kept)
        }
        return StoryDraftMediaReconciliation(
            snapshot = snapshot.copy(slides = cleanedSlides),
            lostMediaIds = lost.toList(),
            recaptureSlideIds = recapture.toList(),
        )
    }
}
