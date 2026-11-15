package me.meeshy.sdk.model.appearance

import kotlin.math.ceil

/*
 * Le plan d'une tuile de motif et la clé qui la cache (#10631, spec §§ 8.2, 13) — MIROIR de
 * `AppearanceTileCache.key` et du rendu de `AppearanceTileRenderer`. Une tuile est rendue UNE fois en bitmap
 * puis répétée ; le cache est borné (32 entrées) : un défilement parmi les modèles ne les garde pas tous.
 */
object AppearanceTilePlan {

    const val CACHE_CAPACITY = 32

    /** Une couche tournée découvre ses coins : agrandie de la diagonale (×1,5), puis rognée. */
    const val ROTATION_SPREAD = 1.5

    /** Les côtés de la tuile en pixels : l'unité de tuile × l'échelle du modèle × la densité d'écran. */
    fun pixelSize(tile: AppearanceDesignTile, density: Double): Pair<Int, Int> =
        ceil(tile.width * tile.scale * density).toInt().coerceAtLeast(1) to
            ceil(tile.height * tile.scale * density).toInt().coerceAtLeast(1)

    fun spread(tile: AppearanceDesignTile): Double = if (tile.rotation == 0.0) 1.0 else ROTATION_SPREAD

    /** Le modèle (clé + empreinte de son contenu, qu'un pack peut changer sous la même clé), le schéma, l'accent effectif, la densité. */
    fun key(design: AppearanceDesign, scheme: AppearanceScheme, accentHex: String, density: Double): String =
        "${design.key}#${design.hashCode()}|${if (scheme == AppearanceScheme.DARK) "dark" else "light"}|" +
            "${PaintRoleResolver.normalizedAccent(accentHex)}|$density"
}

/** Un cache LRU borné : la plus ancienne entrée tombe au-delà de [capacity]. Non thread-safe — l'appelant synchronise. */
class BoundedLruCache<K : Any, V : Any>(val capacity: Int) {
    private val entries = object : LinkedHashMap<K, V>(capacity, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>): Boolean = size > capacity
    }

    init {
        require(capacity > 0) { "capacité nulle" }
    }

    val size: Int get() = entries.size

    operator fun get(key: K): V? = entries[key]

    fun getOrPut(key: K, render: () -> V?): V? {
        entries[key]?.let { return it }
        val rendered = render() ?: return null
        entries[key] = rendered
        return rendered
    }

    fun clear() = entries.clear()
}
