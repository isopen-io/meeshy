package me.meeshy.sdk.story

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.scene.CanvasMediaAdoption
import me.meeshy.sdk.model.scene.ServedMedia
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest

/**
 * What a publish request says about the media its canvas designates, seen from
 * the post: [Coherent] when every media the canvas designates is listed in the
 * post's `mediaIds`, [Orphans] when it designates rows the post does not own
 * (the reader then paints those scenes BLANK, with no error anywhere).
 */
public sealed interface PublishCoherence {
    public data object Coherent : PublishCoherence

    public data class Orphans(val ids: List<String>) : PublishCoherence
}

/**
 * The second half of the durable upload→publish chain (ARCHITECTURE.md §5): when
 * a media-upload outbox row is delivered, the gateway hands back the real
 * `mediaId`, which must be grafted into every still-queued story publish that was
 * enqueued **before** the upload finished.
 *
 * A media story queued offline carries the prerequisite upload's `cmid` as a
 * **placeholder** in its `mediaIds` (the real id is unknowable at enqueue time);
 * [graft] swaps that placeholder for the real id the moment the upload lands, so
 * the gated publish delivers with the correct id. Surpasses iOS, which uploads
 * synchronously and cannot queue a media story while offline.
 *
 * Swapping `mediaIds` alone is not enough (#5280): the canvas designates its media
 * by `postMediaId` too, and a canvas that keeps the placeholder names a row the
 * post does not own — the scene paints BLANK for every viewer, with no error
 * anywhere. [graft] therefore makes the document **adopt** the real identity
 * ([CanvasMediaAdoption.adoptingByMedia]), and the sounds and stickers it adopts
 * ride in the post's `mediaIds` so the server does not sweep them a day later as
 * abandoned uploads. [seal] applies the same attachment to a publication that
 * never went through a write-back.
 *
 * Pure and total: it decodes a [CreateStoryRequest] payload, rewrites its media
 * list and canvas and re-encodes, returning `null` whenever the write-back is a
 * no-op (no placeholder, no media, undecodable, or an identity swap) so the caller
 * can skip a pointless durable write.
 */
public object PublishMediaWriteBack {

    /**
     * Returns [payload] with every [placeholder] media id replaced by [realId] —
     * in `mediaIds` (order preserved, duplicates collapsed) **and** wherever the
     * canvas designates it (media, sounds, stickers) — or `null` when nothing
     * changes: the payload is undecodable, neither lists nor designates the
     * placeholder, or the swap would leave the request identical.
     *
     * The adopted identity only: the upload outcome carries no URL, so a media
     * object keeps the `mediaURL` it was composed with.
     */
    public fun graft(payload: String, placeholder: String, realId: String): String? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload)
        }.getOrNull() ?: return null
        val listed = request.mediaIds.orEmpty()
        val designated = CanvasMediaAdoption.publicationMediaIds(emptyList(), request.storyEffects)
        if (placeholder !in listed && placeholder !in designated) return null
        val adopted = CanvasMediaAdoption.adoptingByMedia(
            effects = request.storyEffects,
            canvas = null,
            replacing = mapOf(placeholder to ServedMedia(id = realId)),
        ).effects
        val swapped = listed.map { if (it == placeholder) realId else it }.distinct()
        val grafted = request.copy(
            storyEffects = adopted,
            mediaIds = swapped.withDesignatedBy(adopted).takeIf { it.isNotEmpty() },
        )
        if (grafted == request) return null
        return MeeshyApi.json.encodeToString(grafted)
    }

    /**
     * The publication path of the same rule: [request] with every media its canvas
     * designates — pre-uploaded media, sounds, stickers — attached to the post's
     * `mediaIds`, appended after the ones already listed. A request that already
     * lists everything it designates (the nominal case, and every text-only story)
     * comes back as the same instance, so a sealed payload is byte-identical to the
     * one the composer wrote.
     */
    public fun seal(request: CreateStoryRequest): CreateStoryRequest {
        val listed = request.mediaIds.orEmpty()
        val sealed = listed.withDesignatedBy(request.storyEffects)
        if (sealed == listed) return request
        return request.copy(mediaIds = sealed)
    }

    /**
     * Whether the canvas of [request] designates only media the post lists. Meant
     * to run BEFORE [seal]: after it, everything designated is listed by
     * construction. A caller may block the send on [PublishCoherence.Orphans] or
     * warn and let [seal] attach them.
     */
    public fun coherenceOf(request: CreateStoryRequest): PublishCoherence {
        val effects = request.storyEffects ?: return PublishCoherence.Coherent
        val orphans = CanvasMediaAdoption.orphanIds(effects, request.mediaIds.orEmpty())
        return if (orphans.isEmpty()) PublishCoherence.Coherent else PublishCoherence.Orphans(orphans)
    }

    private fun List<String>.withDesignatedBy(effects: StoryEffects?): List<String> =
        this + CanvasMediaAdoption.publicationMediaIds(emptyList(), effects).filter { it !in this }
}
