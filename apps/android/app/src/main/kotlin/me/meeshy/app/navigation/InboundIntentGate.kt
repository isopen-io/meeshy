package me.meeshy.app.navigation

import android.content.Intent
import android.os.Bundle
import me.meeshy.app.composer.inbound.ComposerSeedLaunch
import me.meeshy.app.push.LaunchIntentProof
import me.meeshy.app.push.MeeshyFcmService

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
 *
 * **Les extras d'appel ne sont crus que prouvés (#13504).** Un intent forgé portant `callId` + `autoAnswer` faisait
 * décrocher l'appel d'un attaquant, caméra et micro ouverts, sans geste ; sans `autoAnswer`, il présentait un faux appel
 * entrant sous un nom choisi. Sauf si [isGenuineCallLaunch] reconnaît la preuve que seul Meeshy pose dans ses propres
 * `PendingIntent` ([LaunchIntentProof]), tous les extras d'appel sont retirés : il ne reste, au plus, qu'une conversation
 * à ouvrir, comme un lien `meeshy://` le permet déjà.
 */
internal object InboundIntentGate {
    /**
     * Les récents relancent l'intent RACINE de la tâche : celui du bouton « Répondre » quand il l'a ouverte. Sa preuve est
     * authentique mais le geste qu'elle atteste est passé — un appel ne se décroche ni ne se présente depuis l'historique.
     */
    private fun Intent.isReplayedFromRecents(): Boolean = (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0

    private const val IMPLICIT_ROUTE_SCHEME = "android-app"
    private const val NAV_CONTROLLER_EXTRA_PREFIX = "android-support-nav:controller:"
    private val CALL_EXTRAS = listOf(
        MeeshyFcmService.EXTRA_CALL_ID,
        MeeshyFcmService.EXTRA_CALLER_ID,
        MeeshyFcmService.EXTRA_CALLER_NAME,
        MeeshyFcmService.EXTRA_IS_VIDEO,
        MeeshyFcmService.EXTRA_AUTO_ANSWER,
        LaunchIntentProof.EXTRA_PROOF,
    )

    /**
     * **La graine d'un partage n'est crue que déposée (#13527).** L'extra n'est qu'un jeton de 128 bits que seul le store
     * de Meeshy connaît : un intent forgé qui en porte un autre (ou qui rejoue un jeton déjà repris) ouvrirait un
     * composeur sur rien. Il est retiré sauf si [holdsComposerSeed] le reconnaît.
     */
    fun admit(
        intent: Intent,
        isGenuineCallLaunch: (Intent) -> Boolean = { false },
        holdsComposerSeed: (String) -> Boolean = { false },
    ) {
        val seed = runCatching { intent.getStringExtra(ComposerSeedLaunch.EXTRA_SEED) }.getOrNull()
        if (seed == null || !holdsComposerSeed(seed)) runCatching { intent.removeExtra(ComposerSeedLaunch.EXTRA_SEED) }
        if (intent.data?.scheme.equals(IMPLICIT_ROUTE_SCHEME, ignoreCase = true)) intent.data = null
        val navigationKeys = runCatching {
            intent.extras?.keySet().orEmpty().filter { it.startsWith(NAV_CONTROLLER_EXTRA_PREFIX) }
        }.getOrElse {
            intent.replaceExtras(Bundle())
            emptyList()
        }
        navigationKeys.forEach(intent::removeExtra)
        if (intent.isReplayedFromRecents() || !isGenuineCallLaunch(intent)) CALL_EXTRAS.forEach(intent::removeExtra)
    }
}
