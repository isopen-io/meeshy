package me.meeshy.sdk.model

/** La feuille que le lecteur ouvre de lui-même (iOS `StoryViewerInitialAction`) : commentaires ou vues/réactions. */
enum class StoryViewerInitialAction(val wire: String) {
    COMMENTS("comments"),
    VIEWS("views");

    companion object {
        fun fromWire(raw: String?): StoryViewerInitialAction? = entries.firstOrNull { it.wire.equals(raw?.trim(), ignoreCase = true) }
    }
}

/**
 * Les façons d'entrer dans le lecteur, nommées (iOS `StoryViewerRequest`). C'est la COMBINAISON de [postId] et
 * [startAtFirstUnviewed] qui décide où la lecture commence : cibler un contenu et sauter à la première non vue sont
 * contradictoires, donc les constructeurs nommés les posent ensemble et on ne remplit plus les champs à la main.
 */
data class StoryViewerRequest(
    val groupId: String,
    val postId: String? = null,
    val startAtFirstUnviewed: Boolean = false,
    val singleGroup: Boolean = false,
    val initialAction: StoryViewerInitialAction? = null,
    val targetCommentId: String? = null,
    val targetParentCommentId: String? = null,
) {
    companion object {
        /** L'entrée nomme UN contenu (lien, notification, story touchée dans une liste). */
        fun targetingStory(
            postId: String,
            inGroup: String,
            singleGroup: Boolean = false,
            initialAction: StoryViewerInitialAction? = null,
            targetCommentId: String? = null,
            targetParentCommentId: String? = null,
        ): StoryViewerRequest = StoryViewerRequest(
            groupId = inGroup,
            postId = postId,
            startAtFirstUnviewed = false,
            singleGroup = singleGroup,
            initialAction = initialAction,
            targetCommentId = targetCommentId,
            targetParentCommentId = targetParentCommentId,
        )

        /** L'entrée nomme une PERSONNE : la première story non vue est la bonne réponse. */
        fun openingGroup(
            userId: String,
            singleGroup: Boolean = false,
            initialAction: StoryViewerInitialAction? = null,
        ): StoryViewerRequest = StoryViewerRequest(
            groupId = userId,
            startAtFirstUnviewed = true,
            singleGroup = singleGroup,
            initialAction = initialAction,
        )
    }
}
