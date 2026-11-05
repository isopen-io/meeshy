package me.meeshy.sdk.model.conversationlist

/** Ce que le dépôt d'une conversation sur un en-tête de section décide (iOS `ChipDropAction`). */
sealed interface ChipDropAction {
    data object Pin : ChipDropAction
    data class Move(val sectionId: String) : ChipDropAction
    data object None : ChipDropAction
}

/**
 * Décision du dépôt (iOS `ChipDropResolver`) : « Épinglées » épingle si la conversation ne l'est pas
 * déjà — jamais de désépinglage par dépôt, le menu reste le seul chemin de retrait ; une catégorie
 * déplace sauf no-op ; « Mes conversations » (`other`) efface la catégorie (id vide) ; hors cible, ou
 * sur une section refusée (calculée par la Lentille, tête World Wide), rien.
 *
 * Un dépôt relâché pendant un défilement automatique est ignoré : à pleine vitesse l'en-tête sous le
 * doigt est une loterie, et relâcher en plein défilement est une intention d'abandon.
 */
object ChipDropResolver {

    fun action(
        droppedOn: String?,
        isPinned: Boolean,
        currentSectionId: String,
        isAutoScrolling: Boolean = false,
    ): ChipDropAction {
        if (isAutoScrolling) return ChipDropAction.None
        val sectionId = droppedOn ?: return ChipDropAction.None
        if (!ConversationListSectionDefaults.acceptsDrop(sectionId)) return ChipDropAction.None
        if (sectionId == ConversationListSectionDefaults.PINNED_ID) {
            return if (isPinned) ChipDropAction.None else ChipDropAction.Pin
        }
        val targetId = if (sectionId == ConversationListSectionDefaults.OTHER_ID) "" else sectionId
        return if (targetId == currentSectionId) ChipDropAction.None else ChipDropAction.Move(targetId)
    }
}
