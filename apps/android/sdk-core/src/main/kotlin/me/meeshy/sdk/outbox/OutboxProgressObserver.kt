package me.meeshy.sdk.outbox

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.ongoing.OutboxActivityItem
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw

/**
 * Observe l'avancement des envois longs : la file et le réseau entrent, chaque pas de
 * [OutboxActivityLaw] qui change quelque chose sort (les pas sans effet sont filtrés).
 * Les pas sont espacés de [MIN_INTERVAL_MS] : la file bouge plus vite que l'œil ; les
 * changements intermédiaires sont fusionnés. Le premier plan / l'arrière-plan n'est pas
 * connu ici : l'hôte de la notification décide de poser ou non ce qui sort.
 */
public object OutboxProgressObserver {

    public const val MIN_INTERVAL_MS: Long = 1_000L

    public fun steps(
        items: Flow<List<OutboxActivityItem>>,
        isOffline: Flow<Boolean>,
        wording: () -> OutboxActivityLaw.Wording,
        minIntervalMs: Long = MIN_INTERVAL_MS,
    ): Flow<OutboxActivityLaw.Step> = flow {
        var running: OutboxActivityLaw.Running? = null
        combine(items, isOffline) { queue, offline -> queue to offline }
            .conflate()
            .collect { (queue, offline) ->
                val step = OutboxActivityLaw.step(running, queue, offline, wording())
                running = step.running
                if (step.action == OutboxActivityLaw.Action.None) return@collect
                emit(step)
                delay(minIntervalMs)
            }
    }
}
