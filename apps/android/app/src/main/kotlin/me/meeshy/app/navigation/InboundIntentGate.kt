package me.meeshy.app.navigation

import android.content.Intent
import android.os.Bundle

/**
 * **Ce qu'un intent reçu de l'extérieur a le droit de dire à la navigation** (#13465).
 *
 * `MainActivity` est exportée : un intent EXPLICITE d'une autre app contourne les filtres du manifeste.
 * `NavController.handleDeepLink(activity.intent)` lit, sur n'importe quel intent, ses propres extras
 * `android-support-nav:controller:*` (identifiants de destination et arguments) : sans cette garde, n'importe quelle
 * app atteignait n'importe quelle destination — l'écran d'appel composait sans geste, la feuille « Appeler @x ? »
 * contournée. L'adresse `android-app://androidx.navigation/<route>` (la forme interne des routes) est retirée elle
 * aussi : Navigation 2.8 ne la suit pas par `handleDeepLink`, mais rien ne garantit qu'une version future s'en abstienne.
 *
 * L'app ne fabrique aucun de ces deux formats (aucun `NavDeepLinkBuilder`) : les retirer ne coupe aucun chemin
 * légitime. Des extras illisibles (parcelable piégé) sont jetés en bloc plutôt que de faire tomber l'activité.
 */
internal object InboundIntentGate {
    private const val IMPLICIT_ROUTE_SCHEME = "android-app"
    private const val NAV_CONTROLLER_EXTRA_PREFIX = "android-support-nav:controller:"

    fun admit(intent: Intent) {
        if (intent.data?.scheme.equals(IMPLICIT_ROUTE_SCHEME, ignoreCase = true)) intent.data = null
        val navigationKeys = runCatching {
            intent.extras?.keySet().orEmpty().filter { it.startsWith(NAV_CONTROLLER_EXTRA_PREFIX) }
        }.getOrElse {
            intent.replaceExtras(Bundle())
            emptyList()
        }
        navigationKeys.forEach(intent::removeExtra)
    }
}
