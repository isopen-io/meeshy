package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallAudioRouteKind

/**
 * Synchronisation des routes audio entre le système et l'application, sans état : une route
 * choisie depuis la montre ou la voiture devient la route de l'application, et une route
 * choisie dans la feuille « Sortie » est demandée au système. Rien n'est demandé quand les
 * deux côtés s'accordent déjà, ce qui referme la boucle.
 */
object TelecomAudioSync {

    /** L'identifiant de la route de l'application à choisir pour suivre le système, ou null. */
    fun routeToSelect(systemKind: CallAudioRouteKind?, snapshot: CallAudioRouteSnapshot): Int? {
        if (systemKind == null || systemKind == CallAudioRouteKind.Other) return null
        val active = snapshot.routes.firstOrNull { it.id == snapshot.activeId }
        if (active?.kind == systemKind) return null
        return snapshot.routes.firstOrNull { it.kind == systemKind }?.id
    }

    /** La sortie système à demander pour suivre la route de l'application, ou null. */
    fun endpointToRequest(
        snapshot: CallAudioRouteSnapshot,
        current: TelecomEndpoint?,
        available: List<TelecomEndpoint>,
    ): TelecomEndpoint? {
        val appKind = snapshot.routes.firstOrNull { it.id == snapshot.activeId }?.kind ?: return null
        if (appKind == CallAudioRouteKind.Other || current?.kind == appKind) return null
        return available.firstOrNull { it.kind == appKind }
    }
}
