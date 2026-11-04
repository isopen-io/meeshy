package me.meeshy.sdk.model.reading.river

/**
 * Le cache de rendu de la Rivière (iOS `RiverRenderingMemo`, #3946) : un rendu par EMPREINTE d'entrée.
 * Tant que l'empreinte tient (mêmes messages, même Prisme servi, même présence), le rendu déjà
 * construit est rendu tel quel : aucune géométrie ni index n'est recalculé à la recomposition.
 *
 * Il ne garde que la dernière entrée : un fil qui change invalide, il n'accumule pas.
 */
public class RiverRenderingMemo<K : Any, V : Any> {
    private var key: K? = null
    private var cached: V? = null

    /** Nombre de constructions réelles, pour les témoins de mémoïsation. */
    public var buildCount: Int = 0
        private set

    public fun get(key: K, build: () -> V): V {
        val hit = cached
        if (hit != null && this.key == key) return hit
        val built = build()
        this.key = key
        cached = built
        buildCount += 1
        return built
    }
}
