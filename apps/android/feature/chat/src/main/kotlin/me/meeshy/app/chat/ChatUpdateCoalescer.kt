package me.meeshy.app.chat

import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.chatlist.DeferredListUpdates

/**
 * Ce qui suspend l'application des mises à jour d'enrichissement : un geste de défilement
 * (jusqu'à l'arrêt EFFECTIF de l'élan) ou la liste endormie sous un panneau opaque. Les flux
 * continuent ; seule l'application de l'état attend.
 */
internal class ChatListUpdateGate {
    val scrolling = MutableStateFlow(false)
    val asleep = MutableStateFlow(false)
    fun setScrolling(value: Boolean) { scrolling.value = value }
    fun setAsleep(value: Boolean) { asleep.value = value }
}

internal object ChatUpdateCoalescer {

    /** La fenêtre qui absorbe une rafale de traductions (iOS `queueReconfigure`, 80 ms). */
    const val WINDOW_MS = 80L

    /**
     * Les identifiants dont SEULE une traduction, une transcription ou une piste audio traduite
     * a changé entre deux fenêtres ; `null` dès que la structure (arrivée, retrait, ordre,
     * état d'envoi, contenu, réactions, enveloppe de cache) bouge — cela s'applique aussitôt.
     */
    fun enrichedIds(previous: CacheResult<List<LocalMessage>>?, next: CacheResult<List<LocalMessage>>): Set<String>? {
        if (previous == null || previous::class != next::class) return null
        val before = previous.valueOrNull ?: return null
        val after = next.valueOrNull ?: return null
        if (before.size != after.size) return null
        val touched = LinkedHashSet<String>()
        for (index in after.indices) {
            val old = before[index]
            val new = after[index]
            if (old == new) continue
            if (old.message.id != new.message.id) return null
            if (old.copy(message = old.message.copy(translations = new.message.translations, attachments = new.message.attachments)) != new) {
                return null
            }
            touched += new.message.id
        }
        return touched.takeIf { it.isNotEmpty() }
    }
}

private class Held<T>(val value: T)

private sealed interface CoalescerEvent<out T> {
    data class Value<T>(val value: T) : CoalescerEvent<T>
    data class Gate(val scrolling: Boolean, val asleep: Boolean) : CoalescerEvent<Nothing>
    data object Tick : CoalescerEvent<Nothing>
    data object Done : CoalescerEvent<Nothing>
}

/**
 * Regroupe en [windowMs] les mises à jour d'enrichissement (le flux émet l'état COMPLET, le
 * dernier gagne) et les retient pendant un geste ou un sommeil, puis les rejoue une fois.
 * [enriched] rend les identifiants touchés, ou `null` pour un changement structurel, appliqué
 * sans attente (sauf liste endormie).
 */
internal fun <T> Flow<T>.coalesced(
    gate: ChatListUpdateGate,
    windowMs: Long = ChatUpdateCoalescer.WINDOW_MS,
    enriched: (previous: T?, next: T) -> Set<String>?,
): Flow<T> = channelFlow {
    val inbox = Channel<CoalescerEvent<T>>(Channel.UNLIMITED)
    val upstream = this@coalesced
    launch {
        try {
            upstream.collect { inbox.send(CoalescerEvent.Value(it)) }
        } finally {
            inbox.send(CoalescerEvent.Done)
        }
    }
    val gateJob = launch {
        combine(gate.scrolling, gate.asleep) { s, a -> CoalescerEvent.Gate(s, a) }
            .collect { inbox.send(it) }
    }
    val deferred = DeferredListUpdates()
    var last: Held<T>? = null
    var pending: Held<T>? = null
    var timer: Job? = null

    suspend fun apply(value: T) {
        timer?.cancel()
        timer = null
        pending = null
        deferred.clear()
        last = Held(value)
        send(value)
    }

    for (event in inbox) {
        when (event) {
            is CoalescerEvent.Value -> {
                val ids = last?.let { enriched(it.value, event.value) }
                if (ids == null) {
                    if (deferred.isAsleep) {
                        deferred.offer(null)
                        pending = Held(event.value)
                    } else {
                        apply(event.value)
                    }
                } else {
                    pending = Held(event.value)
                    if (deferred.isHeld) {
                        deferred.offer(ids)
                    } else if (timer == null) {
                        timer = launch {
                            delay(windowMs)
                            inbox.send(CoalescerEvent.Tick)
                        }
                    }
                }
            }
            CoalescerEvent.Tick -> {
                timer = null
                pending?.takeIf { !deferred.isHeld }?.let { apply(it.value) }
            }
            is CoalescerEvent.Gate -> {
                deferred.setScrolling(event.scrolling)
                deferred.setAsleep(event.asleep)
                pending?.takeIf { !deferred.isHeld }?.let { apply(it.value) }
            }
            CoalescerEvent.Done -> {
                pending?.let { apply(it.value) }
                break
            }
        }
    }
    gateJob.cancel()
    timer?.cancel()
}
