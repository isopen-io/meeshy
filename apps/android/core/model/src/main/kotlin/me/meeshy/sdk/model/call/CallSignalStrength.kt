package me.meeshy.sdk.model.call

/**
 * État de la liaison du pair, réduit aux six valeurs dont le glyphe de signal a besoin — miroir de
 * iOS `PeerConnectionState`. Sert uniquement de REPLI avant le premier échantillon de statistiques.
 */
enum class CallLinkState {
    NEW,
    CONNECTING,
    CONNECTED,
    DISCONNECTED,
    FAILED,
    CLOSED,
}

/**
 * Force du signal affichée par le glyphe réseau de l'appel — dérivée PUREMENT des niveaux de qualité
 * déjà mesurés ([VideoQualityLevel]) avec l'état de la liaison en repli quand les statistiques n'ont
 * pas encore produit de tick. Port de iOS `CallSignalStrength` (`CallSignalGlyph.swift`).
 */
enum class CallSignalStrength(
    /** Fraction de barres remplies, de 0 à 1. */
    val barsFraction: Double,
    /** Vrai quand le lien mérite l'attention (ambre ou rouge) ; la négociation initiale n'en est pas. */
    val isDegraded: Boolean,
    /** Vrai pour les états rouges. */
    val isCritical: Boolean,
) {
    EXCELLENT(1.0, isDegraded = false, isCritical = false),
    GOOD(0.75, isDegraded = false, isCritical = false),
    FAIR(0.5, isDegraded = true, isCritical = false),
    POOR(0.25, isDegraded = true, isCritical = true),
    LOST(0.0, isDegraded = true, isCritical = true),
    CONNECTING(0.5, isDegraded = false, isCritical = false),
    ;

    companion object {
        /** Les statistiques temps réel priment ; l'état binaire de la liaison ne sert qu'avant le 1er tick. */
        fun from(level: VideoQualityLevel?, connection: CallLinkState): CallSignalStrength {
            if (level != null) {
                return when (level) {
                    VideoQualityLevel.EXCELLENT -> EXCELLENT
                    VideoQualityLevel.GOOD -> GOOD
                    VideoQualityLevel.FAIR -> FAIR
                    VideoQualityLevel.POOR -> POOR
                    VideoQualityLevel.CRITICAL -> LOST
                }
            }
            return when (connection) {
                CallLinkState.CONNECTED -> GOOD
                CallLinkState.NEW -> FAIR
                CallLinkState.DISCONNECTED, CallLinkState.FAILED, CallLinkState.CLOSED -> LOST
                CallLinkState.CONNECTING -> CONNECTING
            }
        }
    }
}
