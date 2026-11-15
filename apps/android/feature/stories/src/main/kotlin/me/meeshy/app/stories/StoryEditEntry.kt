package me.meeshy.app.stories

/**
 * Quand « Modifier » est offert hors de Mes stories (#13697) : sur SA story, vivante, dont on connaît l'identifiant. Le rail
 * et le lecteur ne portent que des stories vivantes ; une story expirée se republie depuis Mes stories, elle ne se modifie pas.
 */
internal object StoryEditEntry {
    fun offered(isOwnStory: Boolean, storyId: String?, expired: Boolean = false): Boolean =
        isOwnStory && !expired && !storyId.isNullOrBlank()
}
