package me.meeshy.sdk.model.conversationoptions

import me.meeshy.sdk.model.ApiConversationPreferences

/** Ce que la confirmation d'archive annonce : le geste que le toucher fera. */
enum class ArchiveGesture { ARCHIVE, UNARCHIVE }

/**
 * Les préférences personnelles qu'affichent les Options d'une conversation (iOS
 * `APIConversationPreferences` lu par `ConversationPreferencesTab`). Un nom ou une réaction
 * blancs valent absents, comme dans la liste.
 */
data class ConversationOptionsValues(
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val mentionsOnly: Boolean = false,
    val isArchived: Boolean = false,
    val customName: String? = null,
    val reaction: String? = null,
    val tags: List<String> = emptyList(),
    val categoryId: String? = null,
) {
    /** « Mentions seulement » n'a de sens qu'hors du muet (iOS `isEnabled: !isMuted`). */
    val mentionsOnlyEnabled: Boolean get() = !isMuted

    val archiveGesture: ArchiveGesture get() = if (isArchived) ArchiveGesture.UNARCHIVE else ArchiveGesture.ARCHIVE

    companion object {
        fun of(preferences: ApiConversationPreferences?): ConversationOptionsValues {
            val prefs = preferences ?: ApiConversationPreferences()
            return ConversationOptionsValues(
                isPinned = prefs.isPinned,
                isMuted = prefs.isMuted,
                mentionsOnly = prefs.mentionsOnly,
                isArchived = prefs.isArchived,
                customName = prefs.customName?.takeIf { it.isNotBlank() },
                reaction = prefs.reaction?.takeIf { it.isNotBlank() },
                tags = prefs.tags,
                categoryId = prefs.categoryId,
            )
        }
    }
}

/** Un geste des Options, appliqué à l'affichage avant que l'écriture ne revienne. */
sealed interface ConversationOptionsEdit {
    fun applyTo(values: ConversationOptionsValues): ConversationOptionsValues

    data class Pinned(val value: Boolean) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(isPinned = value)
    }

    data class Muted(val value: Boolean) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(isMuted = value)
    }

    data class MentionsOnly(val value: Boolean) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(mentionsOnly = value)
    }

    data class Archived(val value: Boolean) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(isArchived = value)
    }

    data class Reaction(val emoji: String?) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(reaction = emoji?.takeIf { it.isNotBlank() })
    }

    data class Tags(val tags: List<String>) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(tags = tags)
    }

    data class Category(val categoryId: String) : ConversationOptionsEdit {
        override fun applyTo(values: ConversationOptionsValues) = values.copy(categoryId = categoryId)
    }
}

/**
 * L'affichage optimiste des Options (iOS `ConversationOptionsViewModel.applyMutation`) : chaque
 * geste se voit dans l'image du toucher, par-dessus la ligne en cache. Un geste tombe quand la
 * ligne le porte ([absorb]) ou quand son écriture échoue ([settle], le retour arrière).
 */
data class ConversationOptionsOverlay(private val edits: List<ConversationOptionsEdit> = emptyList()) {

    val isEmpty: Boolean get() = edits.isEmpty()

    /** Un geste remplace le précédent sur le même réglage : le dernier toucher décide. */
    fun pending(edit: ConversationOptionsEdit): ConversationOptionsOverlay =
        copy(edits = edits.filterNot { it::class == edit::class } + edit)

    fun displayed(stored: ConversationOptionsValues): ConversationOptionsValues =
        edits.fold(stored) { values, edit -> edit.applyTo(values) }

    fun absorb(stored: ConversationOptionsValues): ConversationOptionsOverlay =
        copy(edits = edits.filterNot { it.applyTo(stored) == stored })

    /** Retire [edit] s'il est encore en attente ; un geste déjà remplacé ne défait rien. */
    fun settle(edit: ConversationOptionsEdit): ConversationOptionsOverlay = copy(edits = edits - edit)
}
