package me.meeshy.app.stories

import me.meeshy.sdk.model.story.StoryReplyRules

/**
 * Which action buttons the story viewer's right-side rail shows for the
 * current slide — Android mirror of the iOS `StoryActionRailPlan` membership
 * rules for the two buttons this viewer ships (react + language).
 */
data class StoryRailPlan(
    val showsReact: Boolean,
    val showsLanguage: Boolean,
    /** « Répondre » (#13501) : la réponse privée à la story de quelqu'un d'autre, iOS `showsReply`. */
    val showsReply: Boolean = false,
) {
    companion object {
        fun resolve(isOwnStory: Boolean, hasTranslatableContent: Boolean, canReply: Boolean = false): StoryRailPlan =
            StoryRailPlan(
                showsReact = !isOwnStory,
                showsLanguage = hasTranslatableContent,
                showsReply = StoryReplyRules.railOffersReply(isOwnStory, canReply),
            )
    }
}
