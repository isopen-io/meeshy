package me.meeshy.sdk.model.media

/**
 * Grille de vitesses de lecture partagée par tous les lecteurs (audio, vidéo, overlay).
 * Miroir de `PlaybackSpeed` d'iOS (`MediaTypes.swift`) : 0,8 → 2,25, défaut 1,0.
 */
public enum class PlaybackSpeed(public val rate: Float, public val label: String) {
    X0_8(0.8f, "0.8×"),
    X0_9(0.9f, "0.9×"),
    X1_0(1.0f, "1×"),
    X1_25(1.25f, "1.25×"),
    X1_5(1.5f, "1.5×"),
    X1_75(1.75f, "1.75×"),
    X2_0(2.0f, "2×"),
    X2_25(2.25f, "2.25×"),
    ;

    /** La vitesse suivante ; après la plus rapide, on reboucle sur la plus lente. */
    public fun next(): PlaybackSpeed = entries[(ordinal + 1) % entries.size]

    public companion object {
        public val DEFAULT: PlaybackSpeed = X1_0

        /** La vitesse de la grille égale à [rate], `null` si hors grille. */
        public fun fromRate(rate: Float): PlaybackSpeed? = entries.firstOrNull { it.rate == rate }
    }
}
