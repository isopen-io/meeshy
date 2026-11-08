package me.meeshy.sdk.socket

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Une requête d'appel ACCESSOIRE : elle sert l'appel sans le porter. Son refus (`call:error`) ne dit rien de la
 * possibilité de l'appel — une passerelle ancienne refusait le rafraîchissement TURN d'un appareil qui venait de
 * décrocher par `NOT_A_PARTICIPANT` (#11463), et le client raccrochait.
 */
enum class CallAccessoryRequest { TurnCredentials, MediaToggle, StateQuery, Invitation, Reaction, Recording }

/**
 * Les requêtes accessoires que ce client vient d'émettre (iOS `CallAccessoryRequestLog`). `call:error` ne nomme pas
 * l'événement qu'il refuse : une erreur reçue dans la fenêtre [ATTRIBUTION_WINDOW_MS] est attribuée à la requête
 * accessoire la plus récente du même appel ; sans requête dans la fenêtre, elle reste une erreur d'appel générique.
 * Le temps est injecté ([clock], millisecondes) : le registre se teste en temps virtuel.
 */
@Singleton
class CallAccessoryRequestLedger internal constructor(private val clock: () -> Long) {

    @Inject
    constructor() : this(System::currentTimeMillis)

    private data class Entry(val request: CallAccessoryRequest, val callId: String?, val at: Long)

    private val lock = Any()
    private var entries: List<Entry> = emptyList()

    fun record(request: CallAccessoryRequest, callId: String?) {
        val now = clock()
        synchronized(lock) {
            val live = entries.filter { now - it.at in 0..ATTRIBUTION_WINDOW_MS }
            entries = (live + Entry(request, callId, now)).takeLast(CAPACITY)
        }
    }

    /** La requête récente à laquelle une erreur de l'appel [errorCallId] (`null` : appel non nommé) répond, s'il y en a une. */
    fun requestAnsweredBy(errorCallId: String?): CallAccessoryRequest? {
        val now = clock()
        return synchronized(lock) {
            entries.lastOrNull { entry ->
                val age = now - entry.at
                age in 0..ATTRIBUTION_WINDOW_MS &&
                    (errorCallId == null || entry.callId == null || errorCallId == entry.callId)
            }?.request
        }
    }

    companion object {
        const val ATTRIBUTION_WINDOW_MS: Long = 8_000
        private const val CAPACITY = 16
    }
}
