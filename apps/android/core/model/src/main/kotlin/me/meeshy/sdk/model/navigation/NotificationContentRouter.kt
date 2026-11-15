package me.meeshy.sdk.model.navigation

import me.meeshy.sdk.model.StoryViewerInitialAction

/** La surface de contenu qu'ouvre une notification sociale (iOS `NotificationContentSurface`). */
public enum class NotificationContentSurface { REEL, STORY, POST }

/**
 * Quelle surface ouvre une notification de contenu (miroir de iOS `NotificationContentRouter`, lui-même miroir de
 * `resolveContentRoute` du web). Le discriminant d'ENTITÉ porté par les métadonnées prime ; le type de notification ne
 * sert qu'en repli, puis un indice du cache local.
 *
 * Le TYPE n'est pas un discriminant d'entité : `story_thread_reply`, `friend_story_comment` et `story_new_comment` sont
 * émis pour TOUT contenu commenté (post, réel, humeur, story). Router sur le type seul ouvrait le lecteur de stories
 * sur une story étrangère pour un commentaire de réel.
 */
public object NotificationContentRouter {
    private val EPHEMERAL_ONLY_TYPES = setOf(
        "story_reaction", "status_reaction",
        "story_new_comment", "friend_story_comment", "story_thread_reply",
        "friend_new_story", "friend_new_mood",
    )
    private val COMMENT_TYPES = setOf(
        "post_comment", "comment_reply", "comment_reaction", "comment_like",
        "story_new_comment", "friend_story_comment", "story_thread_reply",
    )
    private val REACTION_TYPES = setOf("story_reaction", "status_reaction", "post_like")

    /**
     * @param postType `metadata.postType` ; @param contentType `metadata.contentType` (la famille `friend_new_*`),
     * consulté seulement si [postType] est absent ou vide ; @param notificationType repli ;
     * @param storyLifecycleHint vrai quand le post en cache porte un `expiresAt` (éphémère par définition).
     */
    public fun surface(
        postType: String?,
        contentType: String?,
        notificationType: String?,
        storyLifecycleHint: Boolean,
    ): NotificationContentSurface {
        val discriminant = (postType?.takeIf { it.isNotBlank() } ?: contentType)?.trim()?.uppercase()
        when (discriminant) {
            "REEL" -> return NotificationContentSurface.REEL
            "STORY", "STATUS", "MOOD" -> return NotificationContentSurface.STORY
            "POST" -> return NotificationContentSurface.POST
        }
        if (notificationType?.lowercase() in EPHEMERAL_ONLY_TYPES) return NotificationContentSurface.STORY
        return if (storyLifecycleHint) NotificationContentSurface.STORY else NotificationContentSurface.POST
    }

    /** La feuille que la surface ouvre d'emblée : commentaires, vues, ou rien. */
    public fun intent(notificationType: String?): StoryViewerInitialAction? = when (notificationType?.lowercase()) {
        in COMMENT_TYPES -> StoryViewerInitialAction.COMMENTS
        in REACTION_TYPES -> StoryViewerInitialAction.VIEWS
        else -> null
    }

    /** La notification PARLE d'un commentaire : le détail du post s'ouvre sur ses commentaires. */
    public fun opensComments(notificationType: String?): Boolean =
        intent(notificationType) == StoryViewerInitialAction.COMMENTS
}
