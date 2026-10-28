package me.meeshy.app.navigation

import android.content.Intent
import android.net.Uri
import androidx.navigation.NavController
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.navOptions

/**
 * Un lien reçu app OUVERTE (`MainActivity.onNewIntent`) se rejoue dans la navigation en place,
 * comme `.onOpenURL` d'iOS. Pas par `NavController.handleDeepLink`, qui RECRÉE toute la tâche
 * (`TaskStackBuilder`, l'activité est terminée) dès que l'intent porte `FLAG_ACTIVITY_NEW_TASK` —
 * ce que posent le navigateur, le lanceur d'icône et `adb` — et perd l'état de l'écran ouvert.
 * L'adresse est résolue par les `navDeepLink` du graphe (les mêmes qu'au démarrage à froid) et
 * poussée sur la liste : le retour revient à la liste, un second lien remplace le premier.
 */
internal object WarmDeepLink {
    /** L'adresse à rejouer, ou `null` quand l'intent n'est pas un lien (un toucher de notification a son propre chemin). */
    fun replayable(intent: Intent): Uri? =
        intent.takeIf { it.action == Intent.ACTION_VIEW }?.data

    /** Un lien que l'écran visiteur a mis en attente attend un COMPTE (JWT) ; une session d'invité ne le consomme pas (#13530). */
    fun mayReplay(isAuthenticated: Boolean, hasAccount: Boolean, awaitsAccount: Boolean): Boolean =
        isAuthenticated && (hasAccount || !awaitsAccount)

    /** `false` quand aucune destination du graphe ne porte cette adresse. */
    fun open(navController: NavController, uri: Uri): Boolean = try {
        navController.navigate(
            NavDeepLinkRequest.Builder.fromUri(uri).build(),
            navOptions {
                launchSingleTop = true
                popUpTo(Routes.CONVERSATIONS) { inclusive = false }
            },
        )
        true
    } catch (unmatched: IllegalArgumentException) {
        false
    }
}
