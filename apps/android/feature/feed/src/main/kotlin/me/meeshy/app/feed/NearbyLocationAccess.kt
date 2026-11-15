package me.meeshy.app.feed

import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.media.MediaPermissionState

/** Où en est l'accès à la position pour « À proximité ». */
internal enum class NearbyAccess {
    /** La position est utilisable : on peut prendre un point et charger. */
    Granted,

    /** Rien n'a été demandé : l'écran attend le geste de l'utilisateur, aucune boîte n'est affichée. */
    NeedsGesture,

    /** Refusé : l'état vide « position non autorisée » avec son chemin vers les Réglages. */
    Denied,
}

/** Ce que le bouton de l'état « position non autorisée » fait. */
internal enum class NearbyDeniedAction { RequestAgain, OpenSettings }

/**
 * La demande de position de l'écran « À proximité », en logique pure : ouvrir l'écran ne demande
 * RIEN (seul un accès déjà accordé charge tout seul), la demande n'a lieu qu'au geste — avec son
 * explication — et un refus définitif renvoie vers les Réglages au lieu de redemander.
 */
internal class NearbyLocationAccess(
    private val stateOf: suspend (PermissionNature) -> MediaPermissionState,
    private val ensure: suspend (PermissionNature, Boolean) -> Boolean,
) {

    /** À l'ouverture de l'écran ou au retour des Réglages : lit l'état sans jamais rien demander. */
    suspend fun onOpen(): NearbyAccess =
        if (stateOf(PermissionNature.LOCATION).isUsable) NearbyAccess.Granted else NearbyAccess.NeedsGesture

    /** Au geste : explication, boîte système, ou carte Réglages après un refus définitif. */
    suspend fun onGesture(): NearbyAccess =
        if (ensure(PermissionNature.LOCATION, true)) NearbyAccess.Granted else NearbyAccess.Denied

    /** Au retour des Réglages depuis l'état refusé : relance seulement si l'accès est désormais accordé. */
    suspend fun onResumedWhileDenied(): NearbyAccess =
        if (stateOf(PermissionNature.LOCATION).isUsable) NearbyAccess.Granted else NearbyAccess.Denied

    suspend fun deniedAction(): NearbyDeniedAction =
        if (stateOf(PermissionNature.LOCATION).canPrompt) NearbyDeniedAction.RequestAgain else NearbyDeniedAction.OpenSettings
}
