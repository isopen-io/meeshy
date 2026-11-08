package me.meeshy.sdk.story

import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.StoryViewerRequest

/** Ce que la porte d'une story demande au plateau : où vit une story, et la charger s'il l'ignore. */
public interface StoryTrayResolving {
    public fun groupId(storyId: String): String?
    public suspend fun ensureStoryLoaded(postId: String): Boolean
}

/** Ce que la porte demande au lecteur de stories (iOS `StoryViewerCoordinating`). */
public interface StoryViewerPresenting {
    public fun present(request: StoryViewerRequest)
}

/**
 * La seule porte d'une story nommée, pour toutes les entrées (iOS `StoryDoor`). Le `postId` VOYAGE jusqu'au lecteur : il
 * a servi à trouver le groupe, il doit encore désigner la story. Absent du plateau ne veut pas dire absent : le chargement
 * est cache-first et écarte les stories mortes ; le détail du post reste le repli d'une story expirée ou supprimée.
 */
public class StoryDoor(
    private val tray: StoryTrayResolving,
    private val viewer: StoryViewerPresenting,
) {
    public suspend fun open(
        postId: String,
        action: StoryViewerInitialAction? = null,
        commentId: String? = null,
        parentCommentId: String? = null,
        showPostDetail: () -> Unit,
    ) {
        val groupId = tray.groupId(postId)
            ?: tray.takeIf { it.ensureStoryLoaded(postId) }?.groupId(postId)
        if (groupId == null) {
            showPostDetail()
            return
        }
        viewer.present(StoryViewerRequest.targetingStory(postId, groupId, false, action, commentId, parentCommentId))
    }
}
