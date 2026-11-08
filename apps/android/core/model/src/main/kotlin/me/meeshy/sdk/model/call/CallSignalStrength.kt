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

    /** Barres pleines sur les quatre du glyphe (1 → 4, 0,75 → 3, 0,5 → 2, 0,25 → 1, 0 → 0). */
    val filledBars: Int get() = Math.round(barsFraction * CallSignalGlyphSpec.BAR_COUNT).toInt()

    /** La teinte sémantique : vert sain, ambre dégradé, rouge critique, indigo pendant la négociation. */
    val tone: CallSignalTone
        get() = when (this) {
            EXCELLENT, GOOD -> CallSignalTone.SUCCESS
            FAIR -> CallSignalTone.WARNING
            POOR, LOST -> CallSignalTone.ERROR
            CONNECTING -> CallSignalTone.NEGOTIATING
        }

    /**
     * Décrit UNIQUEMENT la force du signal, jamais un événement de connexion : un libellé « Reconnexion »
     * mentirait à TalkBack sur un appel dégradé mais jamais interrompu.
     */
    val label: CallSignalLabel
        get() = when (this) {
            EXCELLENT, GOOD -> CallSignalLabel.GOOD
            FAIR -> CallSignalLabel.FAIR
            POOR -> CallSignalLabel.POOR
            LOST -> CallSignalLabel.LOST
            CONNECTING -> CallSignalLabel.CONNECTING
        }

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

/** Les quatre barres du glyphe de signal. */
object CallSignalGlyphSpec {
    const val BAR_COUNT: Int = 4
}

/** La teinte du glyphe ; la couleur est choisie à l'écran par les jetons du thème. */
enum class CallSignalTone { SUCCESS, WARNING, ERROR, NEGOTIATING }

/** Le libellé parlé du glyphe ; le texte localisé est choisi à l'écran. */
enum class CallSignalLabel { GOOD, FAIR, POOR, LOST, CONNECTING }
