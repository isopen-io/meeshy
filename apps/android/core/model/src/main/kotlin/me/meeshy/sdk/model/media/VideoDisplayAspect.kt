package me.meeshy.sdk.model.media

/**
 * **Le ratio d'affichage d'une vidéo de bulle**, en quatre niveaux (iOS `bubbleAspectRatio`) : l'asset une fois la
 * rotation de sa transformation appliquée, puis la vignette (déjà tournée côté serveur), puis la métadonnée servie
 * (parfois paysage pour un portrait filmé), puis 16:9. Une valeur non positive ou non finie ne compte pas.
 */
public object VideoDisplayAspect {
    private const val FALLBACK = 16.0 / 9.0
    private const val NARROWEST = 9.0 / 16.0

    public fun resolve(
        assetWidth: Int?,
        assetHeight: Int?,
        rotationDegrees: Int,
        thumbnailRatio: Double?,
        metadataRatio: Double?,
    ): Double = assetRatio(assetWidth, assetHeight, rotationDegrees)
        ?: thumbnailRatio.usable()
        ?: metadataRatio.usable()
        ?: FALLBACK

    /** Le ratio suit la source jusqu'à 9:16 : plus étroit, il reste à 9:16 — jamais de lettre-box noir plus haut. */
    public fun bubbleRatio(ratio: Double): Double = ratio.usable()?.coerceAtLeast(NARROWEST) ?: FALLBACK

    private fun assetRatio(width: Int?, height: Int?, rotationDegrees: Int): Double? {
        if (width == null || height == null || width <= 0 || height <= 0) return null
        val quarterTurn = Math.floorMod(rotationDegrees, 180) == 90
        return if (quarterTurn) height.toDouble() / width else width.toDouble() / height
    }

    private fun Double?.usable(): Double? = this?.takeIf { it.isFinite() && it > 0.0 }
}

/**
 * Cache mémoire des ratios d'affichage par URL (iOS `VideoDisplayAspectCache`) : une vidéo déjà vue se dessine juste
 * dès sa seconde apparition. Borné, premier entré premier sorti : une session longue ne garde pas chaque vidéo vue.
 */
public class VideoDisplayAspectCache(private val capacity: Int = DEFAULT_CAPACITY) {
    private val entries = LinkedHashMap<String, Double>()

    init {
        require(capacity > 0) { "capacity must be positive" }
    }

    public val size: Int get() = synchronized(entries) { entries.size }

    public fun ratio(url: String): Double? = synchronized(entries) { entries[url] }

    public fun store(url: String, ratio: Double) {
        synchronized(entries) {
            if (!entries.containsKey(url) && entries.size >= capacity) {
                entries.remove(entries.keys.first())
            }
            entries[url] = ratio
        }
    }

    public companion object {
        public const val DEFAULT_CAPACITY: Int = 2_000
    }
}
