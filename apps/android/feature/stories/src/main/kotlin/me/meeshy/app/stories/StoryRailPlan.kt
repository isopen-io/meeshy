package me.meeshy.app.stories

/**
 * Which action buttons the story viewer's right-side rail shows for the
 * current slide — Android mirror of the iOS `StoryActionRailPlan` membership
 * rules for the two buttons this viewer ships (react + language).
 */
data class StoryRailPlan(
    val showsReact: Boolean,
    val showsLanguage: Boolean,
) {
    companion object {
        fun resolve(isOwnStory: Boolean, hasTranslatableContent: Boolean): StoryRailPlan =
            StoryRailPlan(
                showsReact = !isOwnStory,
                showsLanguage = hasTranslatableContent,
            )
    }
}
