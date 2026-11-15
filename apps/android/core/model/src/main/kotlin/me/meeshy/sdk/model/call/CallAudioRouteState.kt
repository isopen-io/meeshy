package me.meeshy.sdk.model.call

/** Une sortie audio proposée pendant l'appel. [id] est l'identifiant du périphérique plateforme. */
public data class CallAudioRoute(
    val id: Int,
    val name: String,
    val kind: CallAudioRouteKind,
)

/**
 * L'état de la feuille « Sortie » : les routes disponibles, celle qui est active, et ce que la
 * permission Bluetooth permet d'en montrer. Immuable ; chaque transition rend un nouvel état.
 * Miroir de `CallAudioRouteState` (iOS).
 */
public data class CallAudioRouteState(
    val routes: List<CallAudioRoute> = emptyList(),
    val activeId: Int? = null,
    val bluetoothPermitted: Boolean = true,
    val isVideo: Boolean = false,
) {
    /** Les routes montrées : sans la permission Bluetooth, les routes Bluetooth sont masquées. */
    val visibleRoutes: List<CallAudioRoute>
        get() = if (bluetoothPermitted) routes else routes.filter { it.kind != CallAudioRouteKind.Bluetooth }

    /** Vrai quand des routes Bluetooth existent mais sont masquées faute de permission. */
    val bluetoothHidden: Boolean
        get() = !bluetoothPermitted && routes.any { it.kind == CallAudioRouteKind.Bluetooth }

    val active: CallAudioRoute?
        get() = visibleRoutes.firstOrNull { it.id == activeId }

    /** Vrai quand le choix est réel : au moins deux sorties à départager. */
    val offersChoice: Boolean
        get() = visibleRoutes.size > 1

    /** Sélection optimiste : sans effet si la route n'est pas proposée. */
    public fun selecting(id: Int): CallAudioRouteState =
        if (visibleRoutes.any { it.id == id }) copy(activeId = id) else this

    /** Où retomber quand la route active disparaît : l'écouteur en audio, le haut-parleur en vidéo. */
    public fun fallbackRoute(): CallAudioRoute? {
        val preferred = if (isVideo) CallAudioRouteKind.Speaker else CallAudioRouteKind.Earpiece
        return visibleRoutes.firstOrNull { it.kind == preferred }
            ?: visibleRoutes.firstOrNull { it.kind == CallAudioRouteKind.Speaker }
            ?: visibleRoutes.firstOrNull()
    }

    /**
     * Remplace les routes par celles que la plateforme vient de rapporter. La route active est
     * gardée si elle existe encore ; sinon (périphérique débranché) l'état retombe sur
     * [fallbackRoute] — jamais sur une route fantôme, donc jamais de silence.
     */
    public fun withRoutes(newRoutes: List<CallAudioRoute>, platformActiveId: Int? = null): CallAudioRouteState {
        val next = copy(routes = newRoutes)
        val keep = activeId?.takeIf { id -> next.visibleRoutes.any { it.id == id } }
        val resolved = platformActiveId?.takeIf { id -> next.visibleRoutes.any { it.id == id } }
            ?: keep
            ?: next.fallbackRoute()?.id
        return next.copy(activeId = resolved)
    }

    /** Vrai quand la route active a disparu des routes visibles et qu'il faut basculer. */
    public fun needsFallback(): Boolean = activeId != null && active == null
}

/**
 * Capteur de proximité : l'écran s'éteint à l'oreille, seulement en appel audio sur l'écouteur —
 * jamais en haut-parleur, ni sur une sortie externe, ni en vidéo.
 */
public object CallProximityPolicy {
    public fun shouldSense(isVideo: Boolean, activeKind: CallAudioRouteKind?): Boolean =
        !isVideo && activeKind == CallAudioRouteKind.Earpiece
}
