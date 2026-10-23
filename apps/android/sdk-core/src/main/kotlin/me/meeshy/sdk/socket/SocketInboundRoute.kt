package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import org.json.JSONObject
import timber.log.Timber

/**
 * Une ligne du contrat entrant d'une socket : l'événement que la passerelle émet et ce que le client en fait
 * (miroir de `SocketInboundRoute`, iOS). Une route se construit et se teste SANS socket ; c'est
 * [SocketEventRouter] qui l'installe.
 *
 * Le callback Socket.IO ne fait que deux choses sur le fil de la bibliothèque : appeler `arrival` (le
 * relevé de transport, ex. le `_seq` d'une notification, qui doit précéder le décodage), puis mettre le
 * décodage en file sur la voie série. Décodage et livraison se font ensuite hors de ce fil, dans l'ordre
 * d'arrivée.
 */
class SocketInboundRoute internal constructor(
    val event: String,
    internal val receive: (Array<Any>, OrderedDeliveryLane) -> Unit,
) {
    companion object {

        /** Le sujet d'un flux d'événements : sans perte tant qu'il y a un abonné, sans bloquer l'émetteur. */
        fun <T> subject(): MutableSharedFlow<T> =
            MutableSharedFlow(replay = 0, extraBufferCapacity = Int.MAX_VALUE)

        /** Décode la charge en [T] puis la remet à [deliver], sur la voie série. */
        fun <T> decoding(
            event: String,
            json: Json,
            serializer: KSerializer<T>,
            arrival: ((JSONObject) -> Unit)? = null,
            deliver: (T) -> Unit,
        ): SocketInboundRoute = SocketInboundRoute(event) { args, lane ->
            val raw = args.firstOrNull() as? JSONObject
            if (raw != null) {
                observe(event, raw, arrival)
                lane.deliver { guarded(event) { deliver(json.decodeFromString(serializer, raw.toString())) } }
            }
        }

        inline fun <reified T> decoding(
            event: String,
            json: Json,
            subject: MutableSharedFlow<T>,
            noinline arrival: ((JSONObject) -> Unit)? = null,
        ): SocketInboundRoute = decoding(event, json, serializer<T>(), arrival) { value ->
            subject.emitOrLog(event, value)
        }

        /** Remet la charge brute à [handle], sur la voie série (décodage sur mesure, aiguillage). */
        fun raw(
            event: String,
            arrival: ((JSONObject) -> Unit)? = null,
            handle: (JSONObject) -> Unit,
        ): SocketInboundRoute = SocketInboundRoute(event) { args, lane ->
            val raw = args.firstOrNull() as? JSONObject
            if (raw != null) {
                observe(event, raw, arrival)
                lane.deliver { guarded(event) { handle(raw) } }
            }
        }

        fun <T> MutableSharedFlow<T>.emitOrLog(event: String, value: T) {
            if (!tryEmit(value)) Timber.e("Socket route [%s]: evenement refuse par le sujet", event)
        }

        private fun observe(event: String, raw: JSONObject, arrival: ((JSONObject) -> Unit)?) {
            if (arrival == null) return
            try {
                arrival(raw)
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e("Socket arrival hook [%s]: %s", event, failure.javaClass.simpleName)
            }
        }

        /** Journalise le NOM de l'événement et la classe de l'erreur, jamais la charge ni le message. */
        private fun guarded(event: String, block: () -> Unit) {
            try {
                block()
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e("Socket decode error [%s]: %s", event, failure.javaClass.simpleName)
            }
        }
    }
}
