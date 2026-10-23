package me.meeshy.sdk.model

/**
 * Why a guest join failed, reduced to what the screen must say. The pure
 * counterpart of iOS `JoinFlowCopy.joinFailure`: the screen maps each case to a
 * localized string, [ServerMessage] carries the gateway's own words.
 */
sealed interface GuestJoinError {
    /** 404 — the link does not exist. */
    data object LinkNotFound : GuestJoinError

    /** 429 — the conversation is saturated. */
    data object TooManyUsers : GuestJoinError

    /** 401 — the visitor should sign in. */
    data object SignInRequired : GuestJoinError

    /** 5xx, transport failure, or an empty message: the generic connection error. */
    data object ConnectionFailed : GuestJoinError

    /** 409, 410, 403 (the reason) and any other refusal: what the server said. */
    data class ServerMessage(val text: String) : GuestJoinError

    companion object {
        fun from(httpStatus: Int?, message: String?): GuestJoinError {
            val text = message?.trim().orEmpty()
            return when {
                httpStatus == 404 -> LinkNotFound
                httpStatus == 429 -> TooManyUsers
                httpStatus == 401 -> SignInRequired
                httpStatus != null && httpStatus >= 500 -> ConnectionFailed
                text.isEmpty() -> ConnectionFailed
                else -> ServerMessage(text)
            }
        }
    }
}
