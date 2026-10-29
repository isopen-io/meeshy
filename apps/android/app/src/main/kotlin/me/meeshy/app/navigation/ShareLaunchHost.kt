package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import me.meeshy.app.chat.AppShareSheetHost
import me.meeshy.app.feed.LocalReelSceneRenderer
import me.meeshy.app.feed.LocalRepostSceneRenderer
import me.meeshy.app.feed.LocalStoryOpener
import me.meeshy.app.feed.ReelSceneRenderer
import me.meeshy.app.feed.RepostSceneRenderer
import me.meeshy.app.stories.ReelCardScene
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
    val repostScene: RepostSceneRenderer = remember { { item, author, live, open, modifier -> RepostSceneCard(item, author, live, open, modifier) } }
    // La scène d'un réel remplit sa carte (iOS `ReelCardSceneBackdrop`), au lieu de la carte 9:16 d'une story.
    val reelScene: ReelSceneRenderer = remember { { item, accent, live, modifier -> ReelCardScene(item, accent, live, modifier) } }
    // Toucher une story republiée l'ouvre en plein écran, comme iOS : le lecteur de stories de son auteur, pas la fiche du post.
    val openStory: (String, String) -> Unit = remember(navController) { { authorId, storyId -> navController.navigate(Routes.story(authorId, storyId)) } }
    CompositionLocalProvider(
        LocalShareLauncher provides launcher,
        LocalRepostSceneRenderer provides repostScene,
        LocalReelSceneRenderer provides reelScene,
        LocalStoryOpener provides openStory,
    ) { content() }
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
