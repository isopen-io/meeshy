package me.meeshy.sdk.model

/**
 * « Reprendre » une publication échouée (iOS `MyStoriesQueueRows`) : ce que l'échec portait devient un brouillon éditable.
 * Règle pure — le texte, l'audience, les médias nommés et la liste « visible par » repartent tels quels dans UNE slide.
 */
public object StoryFailureDraft {

    /**
     * L'instantané d'un brouillon né d'un échec, ou `null` quand l'échec ne portait rien à reprendre (ni texte ni média).
     * [slideId] est l'identifiant de la slide : fourni par l'appelant pour que la règle reste déterministe.
     */
    public fun snapshotOf(
        slideId: String,
        content: String?,
        mediaIds: List<String>,
        visibility: String,
        visibilityUserIds: List<String>,
        repostOfId: String?,
        nowIso: String,
    ): StoryComposerDraftSnapshot? {
        val text = content.orEmpty()
        val media = mediaIds.filter { it.isNotBlank() }.distinct()
        if (text.isBlank() && media.isEmpty()) return null
        return StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = slideId, text = text, mediaIds = media)),
            selectedId = slideId,
            visibility = visibility.ifBlank { StoryComposerDraftSnapshot.DEFAULT_VISIBILITY },
            repostOfId = repostOfId?.takeIf { it.isNotBlank() },
            visibilityUserIds = visibilityUserIds,
            updatedAt = nowIso,
        )
    }
}
