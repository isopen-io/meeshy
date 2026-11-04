package me.meeshy.app.conversations

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.conversationlist.ConversationListSectionDefaults

/**
 * Mémoire de session des sections dépliées de la liste (iOS `ConversationListSectionMemory`) :
 * hissée hors des composables et du ViewModel, elle survit à la rotation, à la recréation du
 * ViewModel et au changement de colonne d'une tablette. Tant que l'utilisateur n'a rien
 * touché, elle est vide et la liste suit les défauts (« Épinglées », « Mes conversations » et
 * les catégories que le serveur dit dépliées) ; au premier repli ou dépli, l'ensemble effectif
 * est figé puis modifié.
 */
@Singleton
public class ConversationSectionExpansionStore @Inject constructor() {

    private val remembered = MutableStateFlow<Set<String>?>(null)

    /** `null` tant que l'utilisateur n'a rien replié ni déplié pendant cette session. */
    public val rememberedSections: StateFlow<Set<String>?> = remembered.asStateFlow()

    /** Les sections dépliées à afficher : la mémoire de session, sinon les défauts. */
    public fun effective(categories: List<CategoryOption>): Set<String> =
        effective(remembered.value, categories)

    /** Replie ou déplie [sectionId] ; le premier geste fige l'ensemble effectif courant. */
    public fun set(sectionId: String, expanded: Boolean, categories: List<CategoryOption>) {
        remembered.update { current ->
            val base = ConversationListSectionDefaults.initial(current, categories.expandedIds())
            if (expanded) base + sectionId else base - sectionId
        }
    }

    /** Un dépli reçu d'un autre appareil : appliqué seulement si l'utilisateur a déjà figé son ensemble. */
    public fun applyRemote(categoryId: String, expanded: Boolean) {
        remembered.update { current ->
            current?.let { if (expanded) it + categoryId else it - categoryId }
        }
    }

    public companion object {
        public fun effective(remembered: Set<String>?, categories: List<CategoryOption>): Set<String> =
            ConversationListSectionDefaults.initial(remembered, categories.expandedIds())

        private fun List<CategoryOption>.expandedIds(): List<String> =
            filter { it.isExpanded == true }.map { it.id }

        /** Les catégories dont le pli a changé entre deux catalogues (changement d'un autre appareil). */
        public fun remoteChanges(
            before: List<CategoryOption>,
            after: List<CategoryOption>,
        ): Map<String, Boolean> {
            val previous = before.associate { it.id to it.isExpanded }
            return after.mapNotNull { option ->
                val now = option.isExpanded ?: return@mapNotNull null
                val was = previous[option.id]
                if (was != null && was != now) option.id to now else null
            }.toMap()
        }
    }
}
