package me.meeshy.sdk.model.call

/**
 * Identity of a **second** incoming call that arrives while another call is
 * already active — the "call waiting" scenario. iOS surfaces this as a
 * `CallWaitingBannerView` (accept-and-swap / reject / 15 s auto-dismiss-as-reject);
 * this is the pure identity that banner renders and the reject / answer emits are
 * keyed by.
 *
 * A [WaitingCall] is only ever built for a frame that carries a real [callId] —
 * there is nothing to reject or answer without the server id every outbound emit
 * uses.
 */
data class WaitingCall(
    val callId: String,
    val callerId: String,
    val callerName: String,
    val isVideo: Boolean,
) {
    companion object {
        /**
         * Build a [WaitingCall] from an inbound `call:initiated` frame, or `null`
         * when the payload carries no [CallInitiatedPayload.callId] (nothing to act
         * on). The caller name resolves display name → username → user id → the
         * shared fallback (parity with [CallRecord.displayName], skipping blank
         * candidates); [isVideo] follows the payload media [CallInitiatedPayload.type]
         * (`"video"`), any other value — including absence — treated as audio.
         */
        fun from(payload: CallInitiatedPayload): WaitingCall? {
            if (payload.callId.isBlank()) return null
            val initiator = payload.initiator
            return WaitingCall(
                callId = payload.callId,
                callerId = initiator?.userId.orEmpty(),
                callerName = resolveName(initiator),
                isVideo = payload.type == VIDEO_TYPE,
            )
        }

        private fun resolveName(initiator: CallInitiatorInfo?): String {
            initiator?.displayName?.let { if (it.isNotBlank()) return it }
            initiator?.username?.let { if (it.isNotBlank()) return it }
            initiator?.userId?.let { if (it.isNotBlank()) return it }
            return WAITING_CALL_FALLBACK_NAME
        }

        private const val VIDEO_TYPE = "video"
    }
}

/** Displayed when a waiting call arrives with no resolvable caller identity. */
const val WAITING_CALL_FALLBACK_NAME: String = "Inconnu"
