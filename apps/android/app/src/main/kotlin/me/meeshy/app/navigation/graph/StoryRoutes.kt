package me.meeshy.app.navigation.graph

import android.net.Uri
import me.meeshy.app.stories.StoryNotificationTargetArgs
import me.meeshy.app.stories.StoryViewerViewModel
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.story.StoryNotificationContext

/**
 * Propriétaire : lot story-viewer-entry-position-and-skip. Le lecteur ouvert par l'id d'une STORY (notification de
 * réaction ou de commentaire, lien `meeshy.me/story/{id}`) : l'auteur est déduit du plateau ou d'un fetch unitaire,
 * jamais deviné. L'intention (`action`) et le commentaire ciblé voyagent en arguments facultatifs.
 */
internal object StoryRoutes {
    const val STORY_POST: String =
        "story/post/{${StoryViewerViewModel.STORY_ID_ARG}}" +
            "?${StoryViewerViewModel.ACTION_ARG}={${StoryViewerViewModel.ACTION_ARG}}" +
            "&${StoryViewerViewModel.COMMENT_ID_ARG}={${StoryViewerViewModel.COMMENT_ID_ARG}}" +
            "&${StoryViewerViewModel.PARENT_COMMENT_ID_ARG}={${StoryViewerViewModel.PARENT_COMMENT_ID_ARG}}"

    /** `https://meeshy.me/story/{id}` et sa forme `www` : le lecteur, connecté ; la fiche du post en repli (story expirée). */
    val STORY_LINKS: List<String> =
        listOf(PostShareLink.WEB_HOST, PostShareLink.WWW_HOST).map { host -> "https://$host/story/{${StoryViewerViewModel.STORY_ID_ARG}}" }

    fun storyPost(
        storyId: String,
        action: StoryViewerInitialAction? = null,
        commentId: String? = null,
        parentCommentId: String? = null,
    ): String {
        val query = listOfNotNull(
            action?.let { "${StoryViewerViewModel.ACTION_ARG}=${it.wire}" },
            commentId?.takeIf { it.isNotBlank() }?.let { "${StoryViewerViewModel.COMMENT_ID_ARG}=${Uri.encode(it)}" },
            parentCommentId?.takeIf { it.isNotBlank() }?.let { "${StoryViewerViewModel.PARENT_COMMENT_ID_ARG}=${Uri.encode(it)}" },
        ).joinToString("&")
        val base = "story/post/${Uri.encode(storyId)}"
        return if (query.isEmpty()) base else "$base?$query"
    }

    internal val TARGET_ARGS: List<String> = with(StoryNotificationTargetArgs) {
        listOf(ACTION, COMMENT_ID, PARENT_COMMENT_ID, ACTOR_NAME, ACTOR_AVATAR, TRIGGER, EMOJI, PREVIEW, AT)
    }

    /**
     * L'écran cible d'une notification de story (iOS `StoryNotificationTargetScreen`) : cache-first, il ouvre le
     * lecteur si la story est lisible et dit sinon pourquoi elle ne l'est pas. Tous ses arguments sont facultatifs.
     */
    val STORY_TARGET: String =
        "story/target/{${StoryNotificationTargetArgs.STORY_ID}}?" + TARGET_ARGS.joinToString("&") { "$it={$it}" }

    fun storyTarget(
        storyId: String,
        action: StoryViewerInitialAction? = null,
        commentId: String? = null,
        parentCommentId: String? = null,
        context: StoryNotificationContext? = null,
    ): String {
        val query = (
            listOfNotNull(
                action?.let { StoryNotificationTargetArgs.ACTION to it.wire },
                commentId?.let { StoryNotificationTargetArgs.COMMENT_ID to it },
                parentCommentId?.let { StoryNotificationTargetArgs.PARENT_COMMENT_ID to it },
            ) + context?.let(StoryNotificationTargetArgs::encode).orEmpty()
            )
            .filter { it.second.isNotBlank() }
            .joinToString("&") { (name, value) -> "$name=${Uri.encode(value)}" }
        val base = "story/target/${Uri.encode(storyId)}"
        return if (query.isEmpty()) base else "$base?$query"
    }
}
