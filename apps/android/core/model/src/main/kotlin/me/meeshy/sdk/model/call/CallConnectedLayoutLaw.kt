package me.meeshy.sdk.model.call

/**
 * Quand l'écran garde la disposition CONNECTÉE. Une reconnexion la garde si un média a
 * déjà été établi (un creux réseau ne vide pas l'écran) ; avant tout média, un
 * redémarrage ICE retombe sur l'écran de connexion. Miroir de iOS `showsConnectedLayout`.
 */
object CallConnectedLayoutLaw {
    fun showsConnectedLayout(state: CallState, hasEstablishedMedia: Boolean): Boolean = when (state) {
        CallState.Connected -> true
        is CallState.Reconnecting -> hasEstablishedMedia
        else -> false
    }
}
