package me.meeshy.app.calls

import me.meeshy.sdk.model.appearance.AvatarRingDesign

/**
 * Ce que l'écran d'appel montre du correspondant (miroir du `remoteProfile` d'iOS `CallView`) :
 * sa photo dans le disque d'avatar, le contour qu'il a équipé autour de ce disque, et sa
 * bannière en fond flouté — l'avatar en repli quand il n'a pas de bannière. Les adresses sont
 * déjà résolues et admises par la politique média ; `null` = rien à poser.
 */
data class CallPeerVisual(
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val ring: AvatarRingDesign? = null,
    /** Mon nom et ma photo de session : la pastille locale les porte au lieu de l'initiale du mot « Vous ». */
    val selfName: String? = null,
    val selfAvatarUrl: String? = null,
) {
    /** Le nom de la pastille locale : mon nom de session, sinon le mot de repli. Pur. */
    fun localBadgeName(fallback: String): String = selfName?.takeIf { it.isNotBlank() } ?: fallback

    /** Le fond plein écran : la bannière d'abord, l'avatar en repli, rien sinon (dégradé seul). */
    val backdropUrl: String? get() = bannerUrl ?: avatarUrl

    companion object {
        val EMPTY: CallPeerVisual = CallPeerVisual()
    }
}
