package me.meeshy.app.stories

import me.meeshy.sdk.model.story.StoryReplyRules

/**
 * Which action buttons the story viewer's right-side rail shows for the current slide — Android mirror of the iOS
 * `StoryActionRailPlan` (#14313). The membership is decided when the slide opens, from the payload the tray served:
 * a button never appears or vanishes mid-playback.
 */
data class StoryRailPlan(
    val showsReact: Boolean,
    val showsLanguage: Boolean,
    /** « Répondre » (#13501) : la réponse privée à la story de quelqu'un d'autre, iOS `showsReply`. */
    val showsReply: Boolean = false,
    /** « Envoyer » dans Meeshy, pour tous (iOS `showsForward`). */
    val showsSend: Boolean = true,
    /** « Republier » chez autrui (iOS `showsRepost`) ; l'auteur voit « Vues » à sa place. */
    val showsRepost: Boolean = false,
    val showsViews: Boolean = false,
    /** « Composer » chez autrui (iOS `showsCompose`, #9953). */
    val showsCompose: Boolean = false,
    /** « Commentaires » dès le premier (iOS `showsComments`) ; avant, le composeur épinglé écrit le premier. */
    val showsComments: Boolean = false,
) {
    /** Le composeur de commentaire épinglé sous la story (iOS `composerLayer`) : chez autrui seulement. */
    val pinsCommentComposer: Boolean get() = showsReact

    companion object {
        fun resolve(
            isOwnStory: Boolean,
            hasTranslatableContent: Boolean,
            canReply: Boolean = false,
            canCompose: Boolean = false,
            commentCount: Int = 0,
        ): StoryRailPlan =
            StoryRailPlan(
                showsReact = !isOwnStory,
                showsLanguage = hasTranslatableContent,
                showsReply = StoryReplyRules.railOffersReply(isOwnStory, canReply),
                showsSend = true,
                showsRepost = !isOwnStory,
                showsViews = isOwnStory,
                showsCompose = !isOwnStory && canCompose,
                showsComments = commentCount > 0,
            )
    }
}
