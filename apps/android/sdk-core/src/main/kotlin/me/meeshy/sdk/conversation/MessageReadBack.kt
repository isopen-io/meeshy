package me.meeshy.sdk.conversation

/** What a targeted read of one message by its id proved ([MessageHistoryReader.readBack], #19047). */
internal enum class MessageReadBack {
    /** The gateway served the message, and it was merged into Room. */
    MERGED,

    /** The gateway answered without serving it: the message is gone for this reader. */
    ABSENT,

    /** The read failed, was refused, or its account closed meanwhile: nothing is proved. */
    UNKNOWN,
}
