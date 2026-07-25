package me.meeshy.sdk.composer

import me.meeshy.sdk.model.ParticipantPermissions

/**
 * The concrete affordances a message composer may offer for a given participant —
 * derived from a hardened [ParticipantPermissions] by [ComposerAttachmentPolicy].
 *
 * This is a stateless value: it holds no UI, no coroutines, no product decisions
 * about *when* to recompute — only *what* the composer is allowed to show once the
 * permissions are known. The `:feature:chat` layer owns the "when" (loading the
 * anonymous session's permissions and folding them into its `UiState`).
 */
public data class ComposerAffordances(
    val canSendText: Boolean,
    val canSendImages: Boolean,
    val canSendFiles: Boolean,
    val canSendVideos: Boolean,
    val canSendAudios: Boolean,
    val canSendLocations: Boolean,
    val canSendLinks: Boolean,
) {
    /**
     * True when at least one attachment kind reachable behind the "+" ladder is
     * permitted (images, files, videos, audios or locations). Links ride inline in
     * the text — they never open the ladder — so [canSendLinks] is excluded.
     */
    public val showsAttachmentLadder: Boolean
        get() = canSendImages || canSendFiles || canSendVideos || canSendAudios || canSendLocations

    /**
     * True when the participant cannot post text at all — the composer degrades to
     * a read-only viewer (no typing, no send). Attachment gating is independent:
     * [showsAttachmentLadder] answers the ladder question on its own.
     */
    public val isReadOnly: Boolean
        get() = !canSendText
}

/**
 * Maps a participant's hardened [ParticipantPermissions] onto the composer
 * [ComposerAffordances]. A `null` permission set is the registered-user posture —
 * every capability granted — so a normal member's composer is never gated by a
 * missing/anonymous permission record.
 *
 * SOTA note: iOS never consults `ParticipantPermissions` in its composer, so a
 * guest with denied capabilities still sees affordances that the server would
 * later reject. Android gates them at the source of truth instead.
 */
public object ComposerAttachmentPolicy {
    public fun affordances(permissions: ParticipantPermissions?): ComposerAffordances {
        val effective = permissions ?: ParticipantPermissions.defaultUser
        return ComposerAffordances(
            canSendText = effective.canSendMessages,
            canSendImages = effective.canSendImages,
            canSendFiles = effective.canSendFiles,
            canSendVideos = effective.canSendVideos,
            canSendAudios = effective.canSendAudios,
            canSendLocations = effective.canSendLocations,
            canSendLinks = effective.canSendLinks,
        )
    }
}
