package me.meeshy.sdk.composer

import me.meeshy.sdk.model.AttachmentMessageType

/**
 * The kind of payload a single composer send delivers. The attachment path derives
 * it from the resolved MIME via [fromMessageType]; the text/clipboard path is
 * always [TEXT].
 */
public enum class ComposerSendKind {
    TEXT,
    IMAGE,
    VIDEO,
    AUDIO,
    FILE,
    LOCATION,
    ;

    public companion object {
        /**
         * Maps a gateway `messageType` label (as produced by [AttachmentMessageType])
         * onto the send kind. Anything that is not image/video/audio — including a
         * `null`/blank/unknown label — is the generic [FILE], matching the wire
         * classifier's own fallback.
         */
        public fun fromMessageType(messageType: String?): ComposerSendKind =
            when (messageType) {
                AttachmentMessageType.IMAGE -> IMAGE
                AttachmentMessageType.VIDEO -> VIDEO
                AttachmentMessageType.AUDIO -> AUDIO
                else -> FILE
            }
    }
}

/** Why a send was refused. `null` on an allowed [SendDecision]. */
public enum class SendBlockReason {
    /** The viewer cannot post text at all — the composer is a read-only viewer. */
    READ_ONLY,

    /** The viewer lacks the capability for this specific attachment kind. */
    CAPABILITY_DENIED,

    /** The conversation's slow mode is still throttling the viewer's next send. */
    SLOW_MODE_COOLDOWN,
}

/**
 * The single verdict a composer send path acts on: whether the send is allowed and,
 * when not, why — plus the remaining cooldown when the block is the slow-mode timer.
 */
public data class SendDecision(
    val allowed: Boolean,
    val blockReason: SendBlockReason?,
    val cooldownSeconds: Int,
) {
    public companion object {
        /** The send is permitted; no reason, no timer. */
        public val ALLOWED: SendDecision = SendDecision(allowed = true, blockReason = null, cooldownSeconds = 0)
    }
}

/**
 * Pure gate every message send path consults before delivering. It unifies the two
 * independent client-side restrictions — the viewer's per-kind [ComposerAffordances]
 * and the conversation's live [SlowModeState] — into one [SendDecision], so the
 * text, clipboard, picked-file and voice paths all enforce the same rules instead of
 * each re-checking a subset.
 *
 * Precedence: a hard **capability** denial (read-only text, or a denied attachment
 * kind) outranks the **cooldown** — a guest who may not send a file is refused
 * regardless of the timer, and no residual countdown leaks through such a block.
 * Only a *permitted* kind is ever throttled by slow mode.
 *
 * SOTA over iOS: iOS's `UniversalComposerBar` consults neither `ParticipantPermissions`
 * nor a slow-mode interval, and its attachment handlers bypass both — so a denied
 * guest or a throttled member can fire attachments the server later rejects. Android
 * gates every path at the source of truth. Stateless — the "when to recompute / when
 * to record the send stamp" orchestration lives app-side in the chat ViewModel.
 */
public object ComposerSendGate {

    /**
     * Evaluate whether a [kind] send is permitted right now, given the viewer's
     * [affordances] and the conversation's [slowMode] posture.
     */
    public fun evaluate(
        kind: ComposerSendKind,
        affordances: ComposerAffordances,
        slowMode: SlowModeState,
    ): SendDecision {
        if (!affordances.permits(kind)) {
            val reason =
                if (kind == ComposerSendKind.TEXT) SendBlockReason.READ_ONLY
                else SendBlockReason.CAPABILITY_DENIED
            return SendDecision(allowed = false, blockReason = reason, cooldownSeconds = 0)
        }
        if (!slowMode.canSend) {
            return SendDecision(
                allowed = false,
                blockReason = SendBlockReason.SLOW_MODE_COOLDOWN,
                cooldownSeconds = slowMode.remainingSeconds,
            )
        }
        return SendDecision.ALLOWED
    }

    private fun ComposerAffordances.permits(kind: ComposerSendKind): Boolean =
        when (kind) {
            ComposerSendKind.TEXT -> canSendText
            ComposerSendKind.IMAGE -> canSendImages
            ComposerSendKind.VIDEO -> canSendVideos
            ComposerSendKind.AUDIO -> canSendAudios
            ComposerSendKind.FILE -> canSendFiles
            ComposerSendKind.LOCATION -> canSendLocations
        }
}
