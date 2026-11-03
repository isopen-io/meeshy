package me.meeshy.sdk.model.reading.focal

/** Ce que la case monte sous son voile — décidé avant tout dessin pour qu'aucun clair ne fuie. */
sealed interface FocalCellMediaLayer {
    /** Le média net (aucune protection active). */
    data object Clear : FocalCellMediaLayer

    /** Le média flouté, jamais net : possible seulement quand la plateforme sait flouter. */
    data class Blurred(val radiusDp: Int) : FocalCellMediaLayer

    /** Rien n'est monté : la case est un voile opaque, le fichier n'est ni décodé ni exposé. */
    data object Absent : FocalCellMediaLayer
}

enum class FocalCellLabel { ViewOnce, Masked }

/**
 * La loi du voile d'une case de la grille plate (iOS `protectionOverlay`, étendue par le flou 18 dp d'Android) :
 * la vue unique ne monte jamais son média ; une pièce simplement floutée est montée floutée dès l'API 31 et
 * absente en dessous (repli voile opaque) — le flou n'est qu'un effet de rendu, il ne protège jamais seul.
 */
object FocalCellVeil {
    const val BLUR_RADIUS_DP: Int = 18
    const val BLUR_MIN_SDK: Int = 31

    fun mediaLayer(state: FocalMediaProtectionState, sdkInt: Int): FocalCellMediaLayer = when (state) {
        FocalMediaProtectionState.None -> FocalCellMediaLayer.Clear
        is FocalMediaProtectionState.Blurred ->
            if (!state.isViewOnce && sdkInt >= BLUR_MIN_SDK) FocalCellMediaLayer.Blurred(BLUR_RADIUS_DP) else FocalCellMediaLayer.Absent
    }

    fun label(state: FocalMediaProtectionState.Blurred): FocalCellLabel =
        if (state.isViewOnce) FocalCellLabel.ViewOnce else FocalCellLabel.Masked
}
