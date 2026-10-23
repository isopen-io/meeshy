package me.meeshy.app.conversations

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay

/**
 * The list's wall clock, ticking on each minute boundary (iOS `LentilleConversationRow`'s
 * `TimelineView(.periodic(every: 60))` and `PresenceRefreshSignal`): « 2 min » becomes
 * « 3 min », a presence dot decays and a heat fades without anything else changing. Rows
 * read the time from their model, never from `System.currentTimeMillis()` at composition,
 * so only the tick recomposes them.
 */
internal object ConversationListMinuteClock {
    const val MINUTE_MILLIS: Long = 60_000L

    /** How long until the next minute boundary — never zero, so a tick always moves time. */
    fun delayToNextTick(nowMillis: Long): Long = MINUTE_MILLIS - Math.floorMod(nowMillis, MINUTE_MILLIS)
}

@Composable
internal fun rememberMinuteClock(
    now: () -> Long = System::currentTimeMillis,
    sleep: suspend (Long) -> Unit = { delay(it) },
): State<Long> =
    produceState(initialValue = now()) {
        while (true) {
            sleep(ConversationListMinuteClock.delayToNextTick(now()))
            value = now()
        }
    }
