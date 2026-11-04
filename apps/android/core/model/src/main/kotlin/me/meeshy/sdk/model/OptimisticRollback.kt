package me.meeshy.sdk.model

/**
 * Défaire SON geste, pas l'écran entier. Miroir de `OptimisticRollback` (iOS).
 *
 * Restaurer un instantané pris AVANT l'attente effacerait tout ce qui est arrivé entre-temps : messages
 * reçus par socket, pages chargées, autres envois optimistes. Défaire, c'est retirer la ligne posée — ou
 * remettre celle qu'on a ôtée — et rien d'autre.
 */
object OptimisticRollback {

    /** Le résultat d'un retrait : la liste sans la ligne [removed] si elle y était. */
    data class Withdrawal<T>(val items: List<T>, val removed: Boolean)

    /** Retire la ligne optimiste d'identifiant [id], et elle seule. */
    fun <T> withdrawing(id: String, from: List<T>, idOf: (T) -> String): Withdrawal<T> {
        val index = from.indexOfFirst { idOf(it) == id }
        if (index < 0) return Withdrawal(from, removed = false)
        return Withdrawal(from.filterIndexed { i, _ -> i != index }, removed = true)
    }

    /** Remet [item] à sa place d'origine (index borné à la liste), s'il n'y est pas déjà revenu. */
    fun <T> restoring(item: T, at: Int, into: List<T>, idOf: (T) -> String): List<T> {
        val id = idOf(item)
        if (into.any { idOf(it) == id }) return into
        val bounded = at.coerceIn(0, into.size)
        return into.take(bounded) + item + into.drop(bounded)
    }

    /** Un compteur qui suit la ligne retirée — jamais sous zéro. */
    fun decremented(count: Int, removed: Boolean): Int = if (removed) maxOf(0, count - 1) else count
}
