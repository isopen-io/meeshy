package me.meeshy.app.chat.river

import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.reading.river.RiverConversationMapping
import me.meeshy.sdk.model.reading.river.RiverConversationMessage
import me.meeshy.sdk.model.reading.river.RiverCursor
import me.meeshy.sdk.model.reading.river.RiverGeometry
import me.meeshy.sdk.model.reading.river.RiverNavigation
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Le pont entre le fil Android (`BubbleContent`, texte Prisme déjà servi) et la loi de la Rivière
 * (`:core:model`). Pur : aucune lecture hors de ses arguments. Miroir de `RiverConversationMapping`
 * côté iOS pour ce qui touche le fil ; la loi, elle, est dans `RiverConversationMapping`.
 */
internal object RiverThreadMapping {

    /** Un message sans instant lisible n'a pas de place dans le temps : la loi l'écarte (valeur non finie). */
    fun messages(bubbles: List<BubbleContent>): List<RiverConversationMessage> =
        bubbles.map { bubble ->
            RiverConversationMessage(
                id = bubble.messageId,
                senderId = bubble.senderId ?: bubble.senderName ?: bubble.messageId,
                senderName = bubble.senderName?.takeIf { it.isNotBlank() },
                senderUsername = bubble.senderUsername?.takeIf { it.isNotBlank() },
                createdAtMs = isoToEpochMillisOrNull(bubble.createdAtIso)?.toDouble() ?: Double.NaN,
                replyToId = bubble.replyToId,
                isSystem = bubble.isSystem,
                isDeleted = bubble.isDeleted,
            )
        }

    /**
     * Le lecteur est l'auteur de ses propres messages : son identifiant se lit sur le premier message
     * sortant. Sans message sortant il n'a aucune branche, donc aucune rive à tenir (colonne 0).
     */
    fun viewerId(bubbles: List<BubbleContent>): String =
        bubbles.firstOrNull { it.isOutgoing && !it.isSystem }?.senderId.orEmpty()

    fun geometry(bubbles: List<BubbleContent>): RiverGeometry =
        RiverConversationMapping.resolveGeometry(messages(bubbles), viewerId(bubbles))
}

/** Le verdict d'une nouvelle géométrie : la navigation recalée, et si le volet doit RE-CADRER le curseur. */
internal data class RiverReconciliation(
    val navigation: RiverNavigation,
    val reland: Boolean,
)

/**
 * Ce que devient le curseur quand le fil change sous la Rivière (miroir du `adaptiveOnChange` de
 * `RiverConversationHost`) :
 *
 * - la PREMIÈRE géométrie peuplée est le vrai moment d'ouverture : le curseur se pose au présent
 *   (le fil s'ouvre souvent AVANT ses messages — cache puis réseau) ;
 * - ensuite le curseur survit aux arrivées, jamais recalé ; mais quand l'histoire est PRÉFIXÉE, chaque
 *   rang glisse : le curseur reste sur son MESSAGE, pas sur son ancien numéro, et le volet le recadre.
 *
 * Un message qui s'ajoute en bout ne recadre jamais : un lecteur remonté dans l'histoire n'est pas
 * ramené au présent.
 */
internal object RiverReconciler {

    fun reconcile(previous: RiverGeometry, navigation: RiverNavigation, next: RiverGeometry): RiverReconciliation {
        if (previous.rankCount == 0) {
            return RiverReconciliation(
                navigation = navigation.moveTo(RiverConversationMapping.initialCursor(next)),
                reland = true,
            )
        }
        val cursorMessageId = previous.bubbles.firstOrNull { it.rank == navigation.cursor.rank }?.messageId
        val remapped: RiverCursor? = cursorMessageId?.let { RiverConversationMapping.cursorForMessage(it, next) }
        if (remapped != null && remapped != navigation.cursor) {
            return RiverReconciliation(navigation.moveTo(remapped), reland = true)
        }
        return RiverReconciliation(navigation, reland = false)
    }
}
