package me.meeshy.ui.component.people

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/** Période du rafraîchissement de l'horloge de présence : une marche de la règle 60 s / 3 min / 5 min. */
public const val LIVE_PRESENCE_INTERVAL_MILLIS: Long = 30_000L

/** Le flux d'instants (epoch ms) : un tick immédiat puis un par [intervalMillis]. */
public fun livePresenceTicks(
    intervalMillis: Long = LIVE_PRESENCE_INTERVAL_MILLIS,
    now: () -> Long = System::currentTimeMillis,
): Flow<Long> = flow {
    while (true) {
        emit(now())
        delay(intervalMillis)
    }
}

/**
 * Un instant rafraîchi toutes les 30 s tant que l'écran est visible : une liste y rederive ses états de
 * présence (`UserPresence.state(now)`) sans réveil en arrière-plan — la collecte suit le cycle de vie.
 */
@Composable
public fun rememberLivePresenceNow(
    intervalMillis: Long = LIVE_PRESENCE_INTERVAL_MILLIS,
): State<Long> {
    val ticks = remember(intervalMillis) { livePresenceTicks(intervalMillis) }
    return ticks.collectAsStateWithLifecycle(initialValue = System.currentTimeMillis())
}
