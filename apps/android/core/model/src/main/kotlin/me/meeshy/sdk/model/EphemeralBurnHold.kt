package me.meeshy.sdk.model

/**
 * #18556 — la ligne d'un éphémère qui vient de mourir RESTE dans le fil le temps de sa combustion, puis part (iOS
 * `retire(alreadyDead:burning:)`, #17938). Le disque, lui, est déjà écrit : une écriture destructrice ne se diffère pas
 * (`message:expired` marque et purge tout de suite). C'est donc l'ÉCRAN qui garde ce qu'il montrait, allumé
 * ([ignite] : l'échéance ramenée à maintenant, la bulle brûle d'elle-même), pendant [EphemeralBurnLaw.FULL_MILLIS].
 *
 * Seul ce qui était MONTRÉ brûle : une ligne jamais vue part sans feu (pas de rejeu, #8352), une ligne masquée par
 * l'utilisateur ([concealed]) part sans feu, et un changement de fenêtre ([reset]) n'est pas une mort.
 */
data class EphemeralBurnHold<T>(
    private val shown: List<T> = emptyList(),
    private val held: List<Held<T>> = emptyList(),
) {
    data class Held<T>(val item: T, val untilMillis: Long)

    data class Step<T>(val shown: List<T>, val hold: EphemeralBurnHold<T>)

    /** Ce que l'écran garde en feu. */
    val burning: List<T> get() = held.map { it.item }

    /** Quand la prochaine combustion s'achève ; `null` : rien ne brûle. */
    val nextWakeMillis: Long? get() = held.minOfOrNull { it.untilMillis }

    fun next(
        alive: List<T>,
        nowMillis: Long,
        rules: Rules<T>,
        concealed: Set<String> = emptySet(),
    ): Step<T> {
        val aliveKeys = alive.mapTo(HashSet()) { rules.key(it) }
        val kept = held.filter { rules.key(it.item) !in aliveKeys && rules.key(it.item) !in concealed }
        val keptKeys = kept.mapTo(HashSet()) { rules.key(it.item) }
        val ignited = shown
            .filter { val k = rules.key(it); k !in aliveKeys && k !in concealed && k !in keptKeys && rules.burns(it) }
            .map { Held(rules.ignite(it, nowMillis), nowMillis + EphemeralBurnLaw.FULL_MILLIS) }
        val nextHeld = kept + ignited
        val merged = if (nextHeld.isEmpty()) alive else (alive + nextHeld.map { it.item }).sortedWith(rules.order)
        return Step(merged, EphemeralBurnHold(alive, nextHeld))
    }

    /** Les combustions achevées à [throughMillis] quittent l'écran. */
    fun expire(throughMillis: Long): EphemeralBurnHold<T> = copy(held = held.filter { it.untilMillis > throughMillis })

    /** La fenêtre a changé de mode : rien de ce qui en sort n'est mort. */
    fun reset(): EphemeralBurnHold<T> = EphemeralBurnHold()

    /** Ce que la règle sait d'un élément : sa clé, s'il peut brûler, comment l'allumer, son rang dans le fil. */
    class Rules<T>(
        val key: (T) -> String,
        val burns: (T) -> Boolean,
        val ignite: (T, nowMillis: Long) -> T,
        val order: Comparator<T>,
    )
}
