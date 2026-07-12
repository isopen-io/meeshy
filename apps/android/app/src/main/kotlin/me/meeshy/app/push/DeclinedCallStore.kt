package me.meeshy.app.push

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les refus d'appel prononcés depuis la notification pendant que la socket est
 * FROIDE (process réveillé par FCM, connexion pas encore montée) : un
 * `emitEnd` immédiat partirait dans le vide (`_socket` null = jeté en
 * silence) et le correspondant sonnerait 60 s pour rien. Le
 * [me.meeshy.app.MeeshyApplication] draine ce tampon à CHAQUE connexion
 * socket et rejoue `call:end` — idempotent côté gateway, un refus rejoué
 * après coup est un no-op loggé.
 *
 * Borné à [MAX_PENDING] entrées (un refus a une durée de vie utile ≤ la
 * fenêtre de sonnerie ; au-delà le serveur a déjà résolu l'appel en missed).
 */
@Singleton
class DeclinedCallStore @Inject constructor() {

    private val lock = Any()
    private val pending = ArrayDeque<String>()

    /** Enregistre un refus à rejouer ; idempotent sur le même id. */
    fun markDeclined(callId: String) {
        if (callId.isBlank()) return
        synchronized(lock) {
            if (callId in pending) return
            pending.addLast(callId)
            while (pending.size > MAX_PENDING) pending.removeFirst()
        }
    }

    /** Vide et retourne les refus en attente (FIFO) — chaque id n'est rendu qu'une fois. */
    fun drain(): List<String> = synchronized(lock) {
        val drained = pending.toList()
        pending.clear()
        drained
    }

    private companion object {
        const val MAX_PENDING = 8
    }
}
