package me.meeshy.sdk.model.call

/** Les bandeaux du haut de l'appel établi, dans l'ordre où la pile les pose (miroir de iOS `CallTopBanner`). */
enum class CallTopBanner {
    ScreenShare,
    Recording,
    Capture,
    LiveFrame,
}

/**
 * P16.4 à P16.8 — les bandeaux du haut de l'appel (partage d'écran, enregistrement, capture, cadre en direct) forment UNE
 * pile, ancrée SOUS la rangée d'en-tête (Réduire, Image dans l'image, Conversation, capsule), miroir de iOS
 * `CallTopBannerStack`. Règle pure : l'ordre, les dégagements et le mouvement de sortie se prouvent sans écran.
 */
object CallTopBannerStack {
    /** La hauteur de la rangée d'en-tête : sa cible tactile de 48 dp. */
    const val HEADER_ROW_DP: Float = 48f

    /** L'écart entre deux bandeaux, et entre le dernier et ma vignette. */
    const val GAP_DP: Float = 8f

    /** La rangée d'en-tête plus l'écart qui la sépare du premier bandeau : d'où le premier bandeau part, depuis la zone sûre. */
    const val HEADER_ROW_CLEARANCE_DP: Float = HEADER_ROW_DP + GAP_DP

    /** P16.4 — la marge latérale de la pile : les bandeaux tiennent presque toute la largeur. */
    const val HORIZONTAL_MARGIN_DP: Float = 12f

    /** P16.5 — la hauteur du bandeau de partage : la cible de « Arrêter » tient les 48 dp d'Android. */
    const val BANNER_HEIGHT_DP: Float = 48f

    private const val PRIORITY_STEP = 10

    /** Ordre fixe, quel que soit l'ordre d'arrivée : partage → enregistrement → capture → cadre. Un absent ne laisse pas de trou. */
    fun ordered(present: Set<CallTopBanner>): List<CallTopBanner> = CallTopBanner.entries.filter(present::contains)

    /**
     * La priorité d'overlay d'un bandeau : le registre pose le plus grand d'abord, donc l'ordre de la pile vient de CETTE
     * loi et d'aucune constante éparse.
     */
    fun priority(banner: CallTopBanner): Int = (CallTopBanner.entries.size - banner.ordinal) * PRIORITY_STEP

    /**
     * R1.6 · R3.10 — les bandeaux dont la place revient à ma vignette : mon partage, l'enregistrement (carte, capsule ou avis) et
     * la capsule de capture. Un partage REÇU n'y est pas : sa place est en décision porteur (#17730).
     */
    fun countedForSelfTile(isLocalScreenShareShown: Boolean, isRecordingShown: Boolean, isCaptureAlertShown: Boolean): Set<CallTopBanner> =
        buildSet {
            if (isLocalScreenShareShown) add(CallTopBanner.ScreenShare)
            if (isRecordingShown) add(CallTopBanner.Recording)
            if (isCaptureAlertShown) add(CallTopBanner.Capture)
        }

    /**
     * P16.8 · R1.5 — la place que la pile prend sous l'en-tête : ma vignette descend d'autant. Chaque bandeau compte sa hauteur
     * MESURÉE (la carte d'accord est plus haute qu'une capsule), jamais moins que le plancher tant qu'il n'a pas rendu sa mesure,
     * plus l'écart de la pile.
     */
    fun selfTileClearanceDp(counted: Set<CallTopBanner>, heightsDp: Map<CallTopBanner, Float>): Float =
        ordered(counted).sumOf { ((heightsDp[it] ?: 0f).coerceAtLeast(BANNER_HEIGHT_DP) + GAP_DP).toDouble() }.toFloat()

    /** P16.6 — un bandeau repart vers le haut, d'où il vient ; « Réduire les animations » ne garde que le fondu court. */
    fun leavesTowardTop(reduceMotion: Boolean): Boolean = !reduceMotion
}
