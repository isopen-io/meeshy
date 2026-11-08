package me.meeshy.sdk.model.story

/**
 * Le bornage des lecteurs vidéo préparés : au plus [capacity] (2 : N±1), les plus prioritaires d'abord. [update]
 * rend ce qu'il faut préparer et libérer ; un lecteur déjà tenu et encore voulu est conservé (idempotent).
 */
class StoryPlayerPool<K : Any>(val capacity: Int = DEFAULT_CAPACITY) {
    data class Diff<K>(val prepare: List<K>, val release: List<K>)

    private var held: List<K> = emptyList()
    val heldKeys: List<K> get() = held

    fun update(wanted: List<K>): Diff<K> {
        val target = wanted.distinct().take(maxOf(capacity, 0))
        val release = held.filter { it !in target }
        val prepare = target.filter { it !in held }
        held = target
        return Diff(prepare, release)
    }

    /** Fermeture : tout est rendu. */
    fun releaseAll(): List<K> = held.also { held = emptyList() }

    companion object {
        const val DEFAULT_CAPACITY: Int = 2
    }
}
