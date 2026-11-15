package me.meeshy.sdk.model

/**
 * Le réel actif est celui qu'on voit majoritairement, dès le geste — miroir de
 * `ReelPlaybackElection` (ReelInstantSwitch.swift, #9837, #10354).
 *
 * Élu n'est pas posé : [restingId] est le réel sur lequel le défilement s'est
 * arrêté, et lui seul engage son moteur, sa scène et son son. Revenir sous la
 * moitié sans relâcher rend la main au réel d'avant ([activeId] suit la dernière
 * majorité signalée).
 */
public data class ReelPlaybackElection(
    val activeId: String? = null,
    val restingId: String? = activeId,
    val isScrolling: Boolean = false,
) {
    /** Une page passe la moitié de l'écran PENDANT le geste. */
    public fun majority(id: String): ReelPlaybackElection = copy(activeId = id)

    /** La fin du geste (ou une page posée par le code) confirme `id` ; `null` ne change rien. */
    public fun settled(id: String?): ReelPlaybackElection {
        if (id == null) return this
        return copy(activeId = id, restingId = if (isScrolling) restingId else id)
    }

    /** Le pager défile ou vient de s'arrêter : à l'arrêt, l'élu se pose. */
    public fun scrolling(scrolling: Boolean): ReelPlaybackElection =
        copy(isScrolling = scrolling, restingId = if (scrolling) restingId else activeId)
}
