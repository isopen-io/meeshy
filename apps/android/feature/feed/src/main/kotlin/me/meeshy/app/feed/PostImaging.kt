package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

/** Ce qu'« Imager » rend d'une œuvre composée : ses scènes, bout à bout, sur la couleur de son auteur. */
@Immutable
data class PostImagerScenes(val items: List<StoryItem>, val accentHex: String?)

/**
 * Ouvre la vue Imager sur des scènes (#14329) : le moteur d'export des stories, que le fil ne connaît pas, et que l'application
 * monte une fois pour tous les menus ⋯ du fil. `null` hors de l'application : aucun menu n'offre alors « Imager ».
 */
typealias PostSceneImager = (scenes: PostImagerScenes) -> Unit

val LocalPostSceneImager = staticCompositionLocalOf<PostSceneImager?> { null }

/**
 * **« Imager » ne vise qu'une œuvre COMPOSÉE** (iOS `PostSaveAction.imagerAction`) : un post à scène rend toutes ses scènes,
 * un réel composé rend sa scène ; un post ou un réel de médias simple n'a rien à rendre, donc aucune entrée.
 */
object PostImaging {
    fun of(scenes: FeedPostScenes?, composedReel: StoryItem?, reelAccentHex: String?): PostImagerScenes? =
        scenes?.takeIf { it.items.isNotEmpty() }?.let { PostImagerScenes(it.items, it.accentHex) }
            ?: composedReel?.let { PostImagerScenes(listOf(it), reelAccentHex) }
}

/** L'action « Imager » du menu ⋯ de [post], ou `null` quand il n'a rien à rendre ou que l'application ne fournit aucun moteur. */
@Composable
internal fun rememberPostImager(post: FeedPostPresentation): (() -> Unit)? {
    val imager = LocalPostSceneImager.current
    val scenes = post.imagerScenes
    return remember(imager, scenes) { if (imager == null || scenes == null) null else { { imager(scenes) } } }
}

/**
 * Le menu ⋯ du détail d'un post à scène (iOS `PostDetailView.postMenu`) : « Imager » y ouvre la vue Imager. Un réel porte le
 * sien sur sa carte ; un post sans œuvre composée n'en montre aucun.
 */
@Composable
internal fun PostDetailImagerMenu(post: FeedPostPresentation) {
    if (post.showsReelCard) return
    val imager = rememberPostImager(post) ?: return
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(MeeshyIcons.MoreHorizontal, contentDescription = stringResource(R.string.feed_post_options), tint = MeeshyTheme.tokens.textPrimary)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.feed_comment_imagine), color = MeeshyTheme.tokens.textPrimary) },
                onClick = {
                    expanded = false
                    imager()
                },
            )
        }
    }
}
