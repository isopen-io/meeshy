package me.meeshy.sdk.sync

import kotlinx.coroutines.flow.SharedFlow

/** Un registraire de test : garde les abonnements, et rend l'application d'un événement à la main. */
internal class RecordingRegistrar : RelayRegistrar {
    private class Entry(val flow: SharedFlow<*>, val family: OrderedEventLane.Family, val apply: suspend (Any?) -> Unit)

    private val entries = mutableListOf<Entry>()

    @Suppress("UNCHECKED_CAST")
    override fun <T> relay(flow: SharedFlow<T>, family: OrderedEventLane.Family, apply: suspend (T) -> Unit) {
        entries += Entry(flow, family, apply as suspend (Any?) -> Unit)
    }

    fun familyOf(flow: SharedFlow<*>): OrderedEventLane.Family? = entries.firstOrNull { it.flow === flow }?.family

    suspend fun <T> deliver(flow: SharedFlow<T>, value: T) {
        val entry = checkNotNull(entries.firstOrNull { it.flow === flow }) { "flux non relayé" }
        entry.apply(value)
    }
}
