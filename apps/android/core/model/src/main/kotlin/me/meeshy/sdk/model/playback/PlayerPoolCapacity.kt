package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.media.DeviceMediaTier

/**
 * **Combien de lecteurs préparés le pool garde** (iOS `PlayerPoolCapacity`) : chaque lecteur tient un
 * décodeur matériel, la ressource la plus rare d'un réel à l'autre. high/pro : 3 ; mid : 2 ; low : 1.
 */
public object PlayerPoolCapacity {
    public fun players(tier: DeviceMediaTier): Int = when (tier) {
        DeviceMediaTier.LOW -> 1
        DeviceMediaTier.MID -> 2
        DeviceMediaTier.HIGH, DeviceMediaTier.PRO -> 3
    }
}

/**
 * **Quel lecteur le pool rend quand il déborde** (iOS `PlayerPoolEviction`) : le plus LOIN du réel affiché
 * d'abord (une distance inconnue passe avant tout voisin déclaré), puis, à distance égale, le plus ancien.
 */
public object PlayerPoolEviction {

    public fun victim(order: List<String>, distances: Map<String, Int>): String? {
        if (order.isEmpty()) return null
        fun rank(key: String): Int = distances[key]?.let { kotlin.math.abs(it) } ?: Int.MAX_VALUE
        var best = 0
        for (i in 1 until order.size) {
            if (rank(order[i]) > rank(order[best])) best = i
        }
        return order[best]
    }

    /** `false` quand [candidate], inséré dans un pool plein, en serait aussitôt la victime. */
    public fun admits(candidate: String, order: List<String>, distances: Map<String, Int>, capacity: Int): Boolean {
        if (candidate in order || order.size < capacity) return true
        return victim(order + candidate, distances) != candidate
    }
}
