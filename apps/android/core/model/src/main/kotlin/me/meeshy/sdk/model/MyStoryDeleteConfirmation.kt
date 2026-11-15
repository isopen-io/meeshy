package me.meeshy.sdk.model

/**
 * Toute suppression de « Mes stories » demande confirmation, avec la conséquence RÉELLE de
 * sa cible. Une seule source pour les alertes (port de `MyStoriesDeleteConfirmation`).
 * Les clés sont celles du catalogue iOS : le texte vient du manifeste i18n.
 */
object MyStoryDeleteConfirmation {

    enum class Target(
        val titleKey: String,
        val messageKey: String,
        /** `true` : l'alerte propose « Reprendre » plutôt que de perdre la dernière copie. */
        val offersResume: Boolean = false,
    ) {
        PUBLISHED_STORY("story.mine.delete.title", "story.mine.delete.message"),
        DRAFT("story.mine.drafts.delete.title", "story.mine.drafts.delete.message"),
        FAILED_ITEM("story.mine.failed.delete.title", "story.mine.failed.delete.message", offersResume = true),
        BULK_SELECTION("story.mine.delete.selected.title", "story.mine.delete.selected.message"),
    }

    fun titleKey(target: Target): String = target.titleKey
    fun messageKey(target: Target): String = target.messageKey
}
