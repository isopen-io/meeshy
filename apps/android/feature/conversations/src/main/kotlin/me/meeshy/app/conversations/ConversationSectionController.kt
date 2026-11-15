package me.meeshy.app.conversations

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.model.CategoryOption

/**
 * Replier ou déplier une section (iOS `toggleSection`) : la mémoire de session répond à
 * l'instant ; pour une catégorie utilisateur le nouvel état part aussi au serveur, en
 * silence (un échec garde l'état local, sans message).
 */
internal class ConversationSectionController(
    private val scope: CoroutineScope,
    private val store: ConversationSectionExpansionStore,
    private val categoryRepository: CategoryRepository,
    private val categories: () -> List<CategoryOption>,
) {

    fun onToggled(section: ConversationSection, expanded: Boolean) {
        store.set(section.sectionId, expanded, categories())
        val categoryId = section.categoryId ?: return
        if (section.kind != ConversationSectionKind.CATEGORY) return
        scope.launch { runCatching { categoryRepository.setExpanded(categoryId, expanded) } }
    }

    /** Déplie [sectionId] pour la session (cible d'un dépôt) : pas d'écriture serveur, ce n'est pas un choix de pli. */
    fun reveal(sectionId: String) {
        store.set(sectionId, true, categories())
    }
}
