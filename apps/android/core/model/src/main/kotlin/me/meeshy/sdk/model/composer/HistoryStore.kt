package me.meeshy.sdk.model.composer

/** Résultat d'un empilement : le nouveau magasin et l'état évincé par le plafond (ou `null`). */
data class HistoryPush<S>(val store: HistoryStore<S>, val evicted: S?)

/** Résultat d'un recul ou d'une avance : le nouveau magasin et l'état qui devient courant. */
data class HistoryStep<S>(val store: HistoryStore<S>, val state: S)

/**
 * Pile d'états de l'annuler/rétablir GLOBAL du composer de story — port de `HistoryStore` (iOS).
 *
 * Des instantanés plutôt que des commandes : toutes les mutations convergent vers un petit
 * nombre de points d'entrée, et empiler l'état complet couvre tout par construction. La pile
 * contient la trajectoire entière, état courant inclus ([index] le pointe). [push] déduplique
 * les états consécutifs identiques, tronque la branche rétablir et évince le plus ancien au-delà
 * du [cap] — l'évincé est RETOURNÉ pour que l'appelant libère les ressources orphelines.
 * Valeur immuable : chaque opération rend un nouveau magasin.
 */
class HistoryStore<S> private constructor(
    private val entries: List<S>,
    private val index: Int,
    private val cap: Int,
) {
    constructor(cap: Int = DEFAULT_CAP) : this(emptyList(), -1, maxOf(2, cap))

    /** Toute la trajectoire encore joignable par annuler/rétablir. */
    val states: List<S> get() = entries

    val current: S? get() = entries.getOrNull(index)

    val canUndo: Boolean get() = index > 0

    val canRedo: Boolean get() = index >= 0 && index < entries.size - 1

    fun push(state: S): HistoryPush<S> {
        if (index >= 0 && entries[index] == state) return HistoryPush(this, null)
        val kept = entries.subList(0, index + 1) + state
        if (kept.size <= cap) return HistoryPush(HistoryStore(kept, kept.size - 1, cap), null)
        return HistoryPush(HistoryStore(kept.drop(1), kept.size - 2, cap), kept.first())
    }

    /** Remplace l'état courant sans créer d'étape : un geste continu ne vaut qu'un cran. */
    fun replaceCurrent(state: S): HistoryStore<S> {
        if (index < 0) return push(state).store
        if (entries[index] == state) return this
        val kept = entries.subList(0, index) + state
        return HistoryStore(kept, kept.size - 1, cap)
    }

    fun undo(): HistoryStep<S>? =
        if (canUndo) HistoryStep(HistoryStore(entries, index - 1, cap), entries[index - 1]) else null

    fun redo(): HistoryStep<S>? =
        if (canRedo) HistoryStep(HistoryStore(entries, index + 1, cap), entries[index + 1]) else null

    companion object {
        const val DEFAULT_CAP: Int = 50
    }
}
