package me.meeshy.app.auth

import android.content.Context
import android.content.Intent

/**
 * Relance l'app sur le serveur qui vient d'être choisi (sélecteur développeur/QA). Le client
 * réseau, le socket et les adresses des médias sont dérivés UNE fois par processus du serveur
 * persisté (`NetworkModule.providesMeeshyConfig`) : seul un nouveau processus les aligne tous.
 * Sans cela, l'étiquette disait « staging » pendant que la connexion partait en production.
 */
internal fun restartToApplyServer(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    val component = launch.component ?: return
    context.startActivity(Intent.makeRestartActivityTask(component))
    Runtime.getRuntime().exit(0)
}
