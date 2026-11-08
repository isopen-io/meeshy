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
import java.io.File
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.card.PostCardImaging
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme

@Immutable
data class PostImagerScenes(val items: List<StoryItem>, val accentHex: String?)

typealias SceneCardRenderer = (onRendered: (File?) -> Unit) -> Unit

@Immutable
data class PostImagerRequest(
    val key: String,
    val card: PostCommentCardSubject,
    val scenes: PostImagerScenes? = null,
    val render: SceneCardRenderer? = null,
) {
    val rendersScene: Boolean get() = scenes != null || render != null
}

typealias PostCardImager = (request: PostImagerRequest) -> Unit

val LocalPostCardImager = staticCompositionLocalOf<PostCardImager?> { null }

object PostImaging {

    fun scenesOf(scenes: FeedPostScenes?, composedReel: StoryItem?, reelAccentHex: String?): PostImagerScenes? =
        scenes?.takeIf { it.items.isNotEmpty() }?.let { PostImagerScenes(it.items, it.accentHex) }
            ?: composedReel?.let { PostImagerScenes(listOf(it), reelAccentHex) }

    fun of(postId: String, support: PostCommentCardPost, scenes: PostImagerScenes?, ephemeral: Boolean): PostImagerRequest? {
        val key = "post:$postId"
        if (scenes == null) return PostCardImaging.cardOf(support, ephemeral)?.let { PostImagerRequest(key, it) }
        if (ephemeral) return null
        return PostImagerRequest(key, PostCardImaging.sceneCardOf(support.author, support.text, support.createdAtMillis), scenes)
    }
}

@Composable
internal fun rememberPostImager(post: FeedPostPresentation): (() -> Unit)? {
    val imager = LocalPostCardImager.current
    val request = post.imager
    return remember(imager, request) { if (imager == null || request == null) null else { { imager(request) } } }
}

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
