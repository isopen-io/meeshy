package me.meeshy.sdk.outbox

/** Test double of [OutboxScheduler]: remembers what the worker planned. */
internal class RecordingOutboxScheduler : OutboxScheduler {
    var nowCount = 0
        private set
    val plannedDelays = mutableListOf<Long>()

    override fun flushNow() {
        nowCount++
    }

    override fun flushAfter(delayMs: Long) {
        plannedDelays += delayMs
    }
}
