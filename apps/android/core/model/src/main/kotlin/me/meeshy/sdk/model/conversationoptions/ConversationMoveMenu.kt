package me.meeshy.sdk.model.conversationoptions

import me.meeshy.sdk.model.CategoryOption

/**
 * Une destination de « Déplacer vers… » : une catégorie, ou « Mes conversations » quand
 * [categoryId] est `null` (aucune catégorie). [isCurrent] pose la coche sur celle où la
 * conversation se trouve déjà.
 */
public data class MoveMenuTarget(
    val categoryId: String?,
    val name: String?,
    val isCurrent: Boolean,
)

/**
 * Le catalogue « Déplacer vers… », écrit UNE fois (miroir de `ConversationMoveToSectionMenuItems`
 * d'iOS) : les catégories par rang, puis « Mes conversations », qui sort la conversation de sa
 * catégorie. Toucher la catégorie COURANTE l'en retire au lieu de la ré-appliquer.
 */
public object ConversationMoveMenu {

    public fun targets(categories: List<CategoryOption>, currentCategoryId: String?): List<MoveMenuTarget> =
        categories.sortedBy { it.order ?: 0 }
            .map { MoveMenuTarget(categoryId = it.id, name = it.name, isCurrent = it.id == currentCategoryId) } +
            MoveMenuTarget(categoryId = null, name = null, isCurrent = currentCategoryId == null)

    /** Ce que le toucher de [target] écrit : la catégorie courante (ou « Mes conversations » depuis nulle part) ne change rien d'autre qu'un retrait. */
    public fun reassignment(currentCategoryId: String?, target: MoveMenuTarget): CategoryReassignment =
        ConversationCategoryReassignment.resolve(
            currentCategoryId = currentCategoryId,
            targetCategoryId = target.categoryId.takeUnless { it == currentCategoryId },
        )
}
