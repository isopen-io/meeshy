package me.meeshy.sdk.model.call

/**
 * The hour of a sentence IN the call (« mm:ss » since its start, « h:mm:ss » past an hour): the same one for the line of
 * the live journal, the capture line and the journal after the call — iOS `CallJournalClock` (#17342, P6.4). Without a
 * start of the call there is no hour, rather than a wall clock that would not say the same thing.
 */
object CallJournalClock {
    fun label(atMs: Long, startedAtMs: Long?): String? =
        startedAtMs?.let { CallDuration.clock(maxOf(0L, atMs - it) / MILLIS_PER_SECOND) }

    private const val MILLIS_PER_SECOND = 1_000L
}
