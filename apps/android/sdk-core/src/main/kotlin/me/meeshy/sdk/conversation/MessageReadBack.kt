package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiMessage

/** What a targeted read of one message by its id proved ([MessageHistoryReader.readBack], #19047). */
internal sealed interface MessageReadBack {
    /** The gateway served the message — [message], as served — and it was merged into Room. */
    data class Served(val message: ApiMessage) : MessageReadBack

    /** The gateway answered without serving it: the message is gone for this reader. */
    data object Absent : MessageReadBack

    /** The read failed, was refused, or its account closed meanwhile: nothing is proved. */
    data object Unknown : MessageReadBack
}
