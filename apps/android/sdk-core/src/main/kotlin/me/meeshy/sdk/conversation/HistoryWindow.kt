package me.meeshy.sdk.conversation

/**
 * The slice of a conversation's cached history the thread observes (#5189, #14670).
 *
 * [Recent] is the nominal window: the newest [Recent.size] rows, grown by backwards pagination.
 * [Anchored] is the window a jump to an old message opens (a search hit, a link): the rows between
 * [Anchored.fromMillis] and [Anchored.throughMillis], both bounds included — `null` meaning up to the
 * present. The cache may hold an older island next to the recent page with a gap between them; an
 * anchored window never shows that gap, it pages newer until it meets the present.
 */
internal sealed interface HistoryWindow {
    data class Recent(val size: Int) : HistoryWindow

    data class Anchored(val fromMillis: Long, val throughMillis: Long?) : HistoryWindow
}

/** What opening a conversation ON a message found (#14670). */
sealed interface MessageLanding {
    /** The message is already in the observed window: nothing moved. */
    data object InWindow : MessageLanding

    /** The window now surrounds the message; [hasNewer] says the present is further down. */
    data class Anchored(val hasNewer: Boolean, val hasOlder: Boolean) : MessageLanding

    /** The server does not serve that message to this reader (deleted, hidden, unknown). */
    data object NotFound : MessageLanding
}
