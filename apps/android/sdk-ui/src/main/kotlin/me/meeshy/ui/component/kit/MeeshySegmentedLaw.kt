package me.meeshy.ui.component.kit

/**
 * La loi du choix segmenté, lue comme des VALEURS : quand le contrôle se rend, où est le courant, quelle option le clavier
 * vise, si un toucher change quelque chose, et comment les segments se répartissent dans la piste. Aucun rendu ici : les
 * trois plateformes lisent les mêmes vecteurs (`docs/product/kit/K03-MeeshySegmented.vectors.json`).
 *
 * Miroir de `MeeshySegmentedLaw` (iOS). Les largeurs sont en unités de la piste (px ou dp, peu importe : la répartition
 * est linéaire).
 */
public object MeeshySegmentedLaw {

    /** Les touches que le contrôle écoute. */
    public enum class Key { Left, Right, Home, End, Space }

    public fun isRenderable(count: Int): Boolean = count in MIN_OPTIONS..MAX_OPTIONS

    /** Les options rendues, dans leur ordre : toutes de deux à quatre, aucune sinon (loi 13 : pas même la piste). */
    public fun <T> rendered(options: List<T>): List<T> = if (isRenderable(options.size)) options else emptyList()

    /** L'index de la sélection parmi les options, ou `null` quand elle n'y est pas : aucun segment courant. */
    public fun <T> currentIndex(selection: T, ids: List<T>): Int? = ids.indexOf(selection).takeIf { it >= 0 }

    /**
     * L'index que sélectionne un toucher sur [target], ou `null` quand il ne change rien : contrôle désactivé, ou segment
     * déjà courant. `null` ⇒ ni rappel ni haptique.
     */
    public fun tapResult(current: Int?, target: Int, isEnabled: Boolean): Int? =
        target.takeIf { isEnabled && current != target }

    /**
     * Les flèches suivent le sens de lecture (en RTL, la droite recule d'une option) et bouclent ; Début et Fin vont aux
     * bornes sans boucler ; Espace ne déplace rien.
     */
    public fun keyboardTarget(key: Key, index: Int, count: Int, rtl: Boolean): Int? = when (key) {
        Key.Right -> wrapped(index, count, if (rtl) -1 else 1)
        Key.Left -> wrapped(index, count, if (rtl) 1 else -1)
        Key.Home -> 0.takeIf { count > 0 }
        Key.End -> (count - 1).takeIf { count > 0 }
        Key.Space -> null
    }

    /** Les index des segments par rangée, dans l'ordre. Une rangée se remplit tant que ses largeurs minimales tiennent. */
    public fun rows(widths: List<Double>, available: Double): List<List<Int>> =
        widths.indices.fold(emptyList()) { rows, index ->
            val last = rows.lastOrNull()
            if (last != null && last.sumOf { widths[it] } + widths[index] <= available) {
                rows.dropLast(1) + listOf(last + index)
            } else {
                rows + listOf(listOf(index))
            }
        }

    /**
     * La largeur de chaque segment, rangée par rangée : parts égales, un segment ne descend jamais sous la largeur de son
     * texte, la place restante se partage.
     */
    public fun partition(widths: List<Double>, available: Double): List<List<Double>> =
        rows(widths, available).map { row -> share(row.map { widths[it] }, available, fixed = emptySet()) }

    private fun wrapped(index: Int, count: Int, delta: Int): Int? =
        if (count > 0) ((index + delta) % count + count) % count else null

    private fun share(widths: List<Double>, available: Double, fixed: Set<Int>): List<Double> {
        val free = widths.indices.filter { it !in fixed }
        val fixedSum = fixed.sorted().sumOf { widths[it] }
        val each = if (free.isEmpty()) 0.0 else (available - fixedSum) / free.size
        val overflowing = free.filter { widths[it] > each }.toSet()
        return if (overflowing.isEmpty()) {
            widths.indices.map { if (it in fixed) widths[it] else each }
        } else {
            share(widths, available, fixed + overflowing)
        }
    }

    private const val MIN_OPTIONS: Int = 2
    private const val MAX_OPTIONS: Int = 4
}
