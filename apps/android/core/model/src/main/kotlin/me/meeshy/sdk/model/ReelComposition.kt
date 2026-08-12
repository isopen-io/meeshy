package me.meeshy.sdk.model

/**
 * Creation-time reel-qualification predicate — pure port of iOS SDK
 * `ReelComposition` (packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift)
 * and mirror of the gateway's authoritative `qualifiesAsReel`
 * (services/gateway/src/services/posts/reelComposition.ts).
 *
 * Règle produit (directive user 2026-08-02) : un post n'est un RÉEL que si sa
 * composition porte une vidéo, un audio, ou au moins deux images. Une image
 * seule, un document ou un lieu restent un post de base (POST).
 *
 * Directive durée minimale : une vidéo ou un audio ne qualifie QUE si sa durée
 * est CONNUE et >= [MIN_QUALIFYING_DURATION_MS] (3s). Une durée absente/nulle
 * est traitée comme non-qualifiante — jamais un fallback permissif. Les
 * images ne sont jamais soumises à cette condition.
 *
 * The gateway is the final authority (`PostService.createPost` silently
 * degrades a claimed REEL that doesn't qualify back to POST) — this predicate
 * exists so the Android client requests the correct [PostType] up front
 * instead of always guessing POST, exactly like iOS's `FeedView.composerOverlay`
 * + `composerForcePlainPost` toggle. Any evolution of the rule touches all
 * three sites (iOS SDK, gateway, here) — that is the single doctrine.
 */
public object ReelComposition {
    public const val MIN_QUALIFYING_DURATION_MS: Long = 3000

    /** One item's composition-relevant shape: MIME type + known duration (video/audio only). */
    public data class MediaKind(val mimeType: String, val durationMs: Long? = null)

    /**
     * `true` when a post with this [media] composition qualifies as a reel: a
     * qualifying video or audio (duration known and >= [MIN_QUALIFYING_DURATION_MS]),
     * or at least two images. Documents and every other kind never qualify —
     * and neither does a single image or a video/audio whose duration is too
     * short or unknown.
     */
    public fun qualifiesAsReel(media: List<MediaKind>): Boolean {
        val normalized = media.map { it.mimeType.lowercase() to it.durationMs }
        val hasQualifyingVideo = normalized.any { (mime, duration) -> mime.startsWith("video/") && meetsMinDuration(duration) }
        val hasQualifyingAudio = normalized.any { (mime, duration) -> mime.startsWith("audio/") && meetsMinDuration(duration) }
        val imageCount = normalized.count { (mime, _) -> mime.startsWith("image/") }
        return hasQualifyingVideo || hasQualifyingAudio || imageCount >= 2
    }

    private fun meetsMinDuration(durationMs: Long?): Boolean =
        durationMs != null && durationMs >= MIN_QUALIFYING_DURATION_MS

    /**
     * The default [PostType] for a new post: [PostType.REEL] when [media]
     * qualifies and the author hasn't [forcePlainPost]d, otherwise [PostType.POST].
     */
    public fun defaultType(media: List<MediaKind>, forcePlainPost: Boolean = false): PostType =
        if (!forcePlainPost && qualifiesAsReel(media)) PostType.REEL else PostType.POST
}
