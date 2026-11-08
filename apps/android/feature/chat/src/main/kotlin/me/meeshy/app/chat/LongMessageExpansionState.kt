package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw

/**
 * Le dépliage des longs messages du fil (iOS `LongMessageExpansionState`, #16463, miroir de la loi de `:core:model`) :
 * plusieurs messages peuvent être dépliés, aucun ne se replie, et l'état vit chez l'hôte du fil — une nouvelle
 * ouverture de la conversation repart repliée.
 */
@Immutable
internal data class LongMessageExpansionState(
    val expandedIds: Set<String> = emptySet(),
) {

    /** Le résultat d'un dépliage : le nouvel état et le bord à retenir pendant que la hauteur s'anime. */
    internal data class Expansion(
        val state: LongMessageExpansionState,
        val anchor: LongMessageExpansionLaw.Anchor,
    )

    fun isExpanded(messageId: String): Boolean = messageId in expandedIds

    /** `null` si le message est déjà déplié : un second toucher ne change rien. */
    fun expanding(messageId: String): Expansion? {
        if (isExpanded(messageId)) return null
        return Expansion(
            state = LongMessageExpansionState(LongMessageExpansionLaw.expanded(expandedIds, messageId)),
            anchor = LongMessageExpansionLaw.ANCHOR,
        )
    }
}
