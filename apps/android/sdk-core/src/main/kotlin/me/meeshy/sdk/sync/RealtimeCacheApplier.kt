package me.meeshy.sdk.sync

import kotlinx.coroutines.flow.SharedFlow

/**
 * Le point d'extension UNIQUE du relais permanent : chaque famille d'événements contribue un applicateur
 * en `@IntoSet`, qui déclare ses flux par [RelayRegistrar.relay]. Le relais ne change jamais : un
 * applicateur de plus est appelé dans l'ordre d'arrivée de sa famille, sans qu'il le sache.
 */
interface RealtimeCacheApplier {
    fun subscribe(registrar: RelayRegistrar)
}

/** Ce que le relais offre à un applicateur : faire passer un flux par la voie ordonnée d'une famille. */
interface RelayRegistrar {
    /**
     * Chaque événement de [flow] s'applique par [apply], dans l'ordre d'arrivée de [family], sous le compte
     * auquel il est arrivé : un événement d'un autre compte que l'actuel est jeté.
     */
    fun <T> relay(flow: SharedFlow<T>, family: OrderedEventLane.Family, apply: suspend (T) -> Unit)
}
