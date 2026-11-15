package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/** Le plafond de médias d'un document et la porte « Publier » (miroir d'iOS `ComposerDocumentPublishGate`). */
object ComposerDocumentRules {
    const val MAX_MEDIA: Int = ComposerMediaSeries.MAX

    /** L'audience est complète : ONLY / EXCEPT exigent au moins une personne nommée. */
    fun audienceIsComplete(visibility: StoryVisibility, userIds: List<String>): Boolean =
        !visibility.requiresUserSelection || userIds.isNotEmpty()

    /** Combien de médias de plus le document accepte. */
    fun freeMediaSlots(attached: Int): Int = (MAX_MEDIA - attached).coerceAtLeast(0)

    /** Une photo sans un mot, un lieu seul, un repost : chacun est une publication. */
    fun canPublish(
        text: String,
        visibility: StoryVisibility,
        visibilityUserIds: List<String>,
        isPublishing: Boolean,
        repostOfId: String?,
        hasMedia: Boolean = false,
        hasLocation: Boolean = false,
    ): Boolean {
        if (isPublishing || !audienceIsComplete(visibility, visibilityUserIds)) return false
        return repostOfId != null || hasMedia || hasLocation || text.isNotBlank()
    }
}
