package me.meeshy.sdk.model.call

/**
 * L'en-tête de l'écran d'appel (miroir de iOS `CallView+Header.swift`) : le chevron « Réduire » et
 * la porte vers la conversation à GAUCHE, la puce durée / signal à DROITE. Le nom, la qualité et le
 * compteur ne flottent plus au centre d'une scène vidéo : le centre appartient à l'image.
 */
object CallHeaderLaw {
    /** Le signal est INVISIBLE sur un lien sain ; il apparaît à la dégradation et reste ce temps-là, vert, une fois guéri (iOS : 30 s). */
    const val SIGNAL_RECOVERY_LINGER_MILLIS: Long = 30_000

    /** La puce n'existe que sur un appel établi dont la disposition n'a pas sa propre ligne de statut (l'audio l'a sous l'avatar). */
    fun showsDurationChip(showsConnectedLayout: Boolean, isVideoUiActive: Boolean, isGroupStage: Boolean = false): Boolean =
        showsConnectedLayout && (isVideoUiActive || isGroupStage)

    /** La porte vers la conversation : absente quand l'appel ne sait pas dans quelle conversation il vit (appel réveillé par un push sans salon). */
    fun showsConversationButton(conversationId: String?): Boolean = !conversationId.isNullOrBlank()

    /** Le bloc pair (nom · statut · qualité) ne se pose au centre qu'hors scène vidéo. */
    fun centersPeerBlock(isVideoStage: Boolean): Boolean = !isVideoStage

    fun signalStrength(quality: ConnectionQuality?): CallSignalStrength = when (quality) {
        ConnectionQuality.EXCELLENT -> CallSignalStrength.EXCELLENT
        ConnectionQuality.GOOD -> CallSignalStrength.GOOD
        ConnectionQuality.FAIR -> CallSignalStrength.FAIR
        ConnectionQuality.POOR -> CallSignalStrength.POOR
        null -> CallSignalStrength.CONNECTING
    }
}
