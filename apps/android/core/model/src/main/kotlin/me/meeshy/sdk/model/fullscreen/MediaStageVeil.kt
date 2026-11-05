package me.meeshy.sdk.model.fullscreen

/**
 * Ce qu'une ouverture (rangée de réactions, barre de réponse) efface, et ce qu'elle ne touche pas : le CHROME s'efface,
 * la GÉOMÉTRIE ne bouge jamais (miroir de `MediaStageVeil.swift`).
 */
public object MediaStageVeil {
    public data class Overlays(val reactionRow: Boolean = false, val replyBar: Boolean = false) {
        public val isOpen: Boolean get() = reactionRow || replyBar
        public companion object { public val Closed: Overlays = Overlays() }
    }

    /** Le chrome se peint si la scène est encadrée ET qu'aucune ouverture n'est là. */
    public fun showsChrome(presentation: StagePresentation, overlays: Overlays): Boolean =
        presentation.showsPlateau && !overlays.isOpen

    /** Entrée en plein écran sans chrome, sauf si le lecteur d'écran est actif. */
    public fun entryPresentation(screenReaderRunning: Boolean): StagePresentation =
        if (screenReaderRunning) StagePresentation.Carded else StagePresentation.Full(pausedOnEntry = false)

    /** La pastille « En pause » se tait sous le voile. */
    public fun showsPausedBadge(verdict: Boolean, overlays: Overlays): Boolean = verdict && !overlays.isOpen

    /** Ce que reçoit le solveur : le plein cadre, quelle que soit l'ouverture ; seule la porte de pause traverse. */
    @Suppress("UNUSED_PARAMETER")
    public fun geometryPresentation(presentation: StagePresentation, overlays: Overlays): StagePresentation =
        StagePresentation.Full(pausedOnEntry = presentation.pausedOnEntry)

    /** La marge basse de la rangée d'émojis : la gouttière, et rien d'autre. */
    public fun rowBottomInset(corridors: MediaStageFraming.Corridors): Float = corridors.gutter
}
