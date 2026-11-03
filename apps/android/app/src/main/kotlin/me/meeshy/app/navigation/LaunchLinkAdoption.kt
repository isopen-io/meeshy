package me.meeshy.app.navigation

import android.content.Intent
import android.net.Uri
import me.meeshy.sdk.model.deeplink.DeepLinkDestination
import me.meeshy.sdk.model.deeplink.DeepLinkParser

/**
 * **Ce que la racine adopte d'un lien reçu au lancement** : un lien Meeshy que le graphe ne lit pas devient le lien
 * en attente (`MainActivity.warmDeepLink`), rejoué par [DeepLinkDispatcher] une fois la session ouverte, et son
 * adresse est retirée de l'intent pour que le `NavHost` n'en fasse pas autre chose. Un code d'invitation est
 * retenu tout de suite, session ou non : c'est l'inscription qui le consommera.
 */
internal object LaunchLinkAdoption {
    fun adopt(intent: Intent, dispatcher: DeepLinkDispatcher, restored: Boolean): Uri? {
        if (restored) return null
        rememberReferral(intent, dispatcher)
        val link = viewLink(intent) ?: return null
        if (!DeepLinkRouter.ownsLink(link)) return null
        return intent.data.also { intent.data = null }
    }

    fun rememberReferral(intent: Intent, dispatcher: DeepLinkDispatcher) {
        val link = viewLink(intent) ?: return
        val destination = DeepLinkParser.parse(link, DeepLinkRouter.WEB_ORIGIN)
        if (destination is DeepLinkDestination.Referral) dispatcher.rememberReferral(destination.code)
    }

    private fun viewLink(intent: Intent): String? =
        intent.takeIf { it.action == Intent.ACTION_VIEW }?.dataString
}
