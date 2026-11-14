package me.meeshy.sdk.model.call

/**
 * Ce que la loi des pastilles de service lit de l'appel. [isOnHold] vient de [CallHoldPolicy.isOnHold] (attente imposée par le
 * système : interface téléphonique ou focus audio perdu) ; [videoNotice] vient de [CallVideoNotice.of] (chaleur, lumière).
 */
data class CallServicePillSignals(
    val isConnectedLayout: Boolean,
    val isPictureInPicture: Boolean,
    val isOnHold: Boolean,
    val isVideoCall: Boolean,
    val isCameraOn: Boolean,
    val videoNotice: CallVideoNotice,
)

/** Les pastilles de service montrées : « En attente » (E3) et l'avis sur ma vidéo (E4), [CallVideoNotice.None] = aucun. */
data class CallServicePills(val isHoldShown: Boolean, val videoNotice: CallVideoNotice) {
    /** Les maillons qu'elles occupent dans la pile des bannières du haut, dans l'ordre de la pile. */
    val banners: Set<CallTopBanner>
        get() = buildSet {
            if (isHoldShown) add(CallTopBanner.Hold)
            if (videoNotice != CallVideoNotice.None) add(CallTopBanner.VideoNotice)
        }

    companion object {
        val None = CallServicePills(isHoldShown = false, videoNotice = CallVideoNotice.None)
    }
}

/**
 * #18227 · #18215 — quand les pastilles de service se montrent (planche E3 · E4), sur les trois plateformes, mêmes vecteurs :
 * - « En attente » : dès que l'appel est en attente, quel que soit l'écran (reconnexion, image dans l'image comprises) — c'est
 *   elle qui dit pourquoi on n'entend plus rien ;
 * - « Vidéo réduite / Faible lumière » : seulement sur l'appel établi à l'écran, en vidéo, caméra allumée, hors image dans
 *   l'image (la fenêtre réduite n'a pas la place d'une phrase).
 */
object CallServicePillLaw {
    fun of(signals: CallServicePillSignals): CallServicePills = CallServicePills(
        isHoldShown = signals.isOnHold,
        videoNotice = if (showsVideoNotice(signals)) signals.videoNotice else CallVideoNotice.None,
    )

    private fun showsVideoNotice(signals: CallServicePillSignals): Boolean =
        signals.isConnectedLayout && !signals.isPictureInPicture && signals.isVideoCall && signals.isCameraOn
}
