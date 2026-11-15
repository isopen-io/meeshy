package me.meeshy.sdk.model.sync

/**
 * Le compte à qui appartient la synchronisation en vol — miroir de `SyncOwnership` (iOS,
 * `SyncEngineState.swift`, #8651). La synchro du compte quitté ne bloque pas celle du suivant et ne
 * peut plus écrire dans le cache : un propriétaire est reconnu, jamais deviné.
 */
class SyncOwnership<Waiter> {
    var owner: String? = null
        private set
    private var waiters: List<Waiter> = emptyList()

    /** `claimed` faux : ce compte tient déjà le verrou. Sinon [released] sont les attentes du précédent. */
    data class Claim<Waiter>(val claimed: Boolean, val released: List<Waiter>)

    fun claim(candidate: String): Claim<Waiter> {
        if (owner == candidate) return Claim(false, emptyList())
        owner = candidate
        return Claim(true, takeWaiters())
    }

    fun release(candidate: String): List<Waiter> {
        if (owner != candidate) return emptyList()
        owner = null
        return takeWaiters()
    }

    /** Vrai : le candidat passe. Faux : il tient l'attente [waiter] jusqu'à la libération. */
    fun admit(candidate: String, waiter: Waiter): Boolean {
        if (owner != candidate) return true
        waiters = waiters + waiter
        return false
    }

    /** Le compte [account] possède-t-il encore la session ? Sans compte connu, personne ne la dispute. */
    fun owns(account: String?): Boolean = account == null || owner == null || owner == account

    private fun takeWaiters(): List<Waiter> {
        val taken = waiters
        waiters = emptyList()
        return taken
    }
}
