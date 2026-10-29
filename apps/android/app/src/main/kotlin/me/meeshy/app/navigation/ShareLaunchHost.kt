package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import me.meeshy.app.chat.AppShareSheetHost
import me.meeshy.app.feed.LocalRepostSceneRenderer
import me.meeshy.app.feed.RepostSceneRenderer
import me.meeshy.app.stories.RepostSceneCard
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.ShareLauncher

private data class PendingShare(val subject: ShareSubject, val onDismissed: () -> Unit)

/**
 * **La racine de la feuille de partage unique** (#13474) : fournit [LocalShareLauncher] à toute l'application
 * et monte LA feuille quand une porte (story, post, réel, profil, lien) y pose son [ShareSubject]. L'état
 * « quelle feuille est ouverte » est lu ICI seulement — l'ouvrir ou la fermer ne recompose pas `MeeshyApp`.
 * « Envoyé à X · Ouvrir » ouvre la conversation servie.
 */
@Composable
fun ShareLaunchHost(navController: NavHostController, content: @Composable () -> Unit) {
    var pending by remember { mutableStateOf<PendingShare?>(null) }
    val launcher = remember { ShareLauncher { subject, onDismissed -> pending = PendingShare(subject, onDismissed) } }
    // La scène d'une story reposté se dessine dans le fil par le lecteur du module des stories (#13654).
    val repostScene: RepostSceneRenderer = remember { { item, author, open, modifier -> RepostSceneCard(item, author, open, modifier) } }
    CompositionLocalProvider(LocalShareLauncher provides launcher, LocalRepostSceneRenderer provides repostScene) { content() }
    pending?.let { share ->
        AppShareSheetHost(
            subject = share.subject,
            onDismiss = {
                pending = null
                share.onDismissed()
            },
            onOpenConversation = { navController.navigate(Routes.chat(it)) },
        )
    }
}
