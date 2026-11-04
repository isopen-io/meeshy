package me.meeshy.app.chat

import me.meeshy.sdk.model.MessageActionPolicy

/** Le menu en deux niveaux : au plus [MessageActionPolicy.MAX_PRIMARY_ACTIONS] entrées principales, puis « Plus… ». */
internal data class MessageActionTiers(
    val primary: List<MessageAction>,
    val more: List<MessageAction>,
)

/**
 * Répartition pure du menu d'appui long entre sa liste principale et « Plus… » (miroir de iOS
 * `MessageActionResolver.primaryActions`). Elle consomme la liste déjà jugée par [MessageActionMenu] : une entrée
 * absente de l'entrée n'est jamais fabriquée ici, et l'ordre relatif est conservé.
 *
 * - Les actions de contenu (répondre, lien, éditer, sélectionner, traduire, copier, imager, enregistrer) sont
 *   principales ; la suppression l'est aussi, à un geste, juste avant « Plus… ».
 * - Au-delà du plafond, ce qui a un jumeau dans « Plus… » y passe d'abord, dans l'ordre fixé par [OVERFLOW_ORDER].
 * - Vue unique, message supprimé ou éphémère échu : aucune entrée de contenu, seulement Supprimer et les infos.
 */
internal object MessageActionResolver {
    private val CONTENT_ORDER: List<MessageAction> = listOf(
        MessageAction.Reply,
        MessageAction.OpenLink,
        MessageAction.CopyLink,
        MessageAction.Map,
        MessageAction.Edit,
        MessageAction.Select,
        MessageAction.ShowOriginal,
        MessageAction.ShowTranslation,
        MessageAction.Translate,
        MessageAction.Copy,
        MessageAction.ExportCard,
        MessageAction.SaveMedia,
    )

    private val DELETIONS: Set<MessageAction> = setOf(MessageAction.DeleteForEveryone, MessageAction.DeleteForMe)

    /** Ce qui déborde d'abord vers « Plus… » : imager, copier, traduire, éditer. */
    internal val OVERFLOW_ORDER: List<MessageAction> = listOf(
        MessageAction.ExportCard,
        MessageAction.Copy,
        MessageAction.Translate,
        MessageAction.Edit,
    )

    fun split(offered: List<MessageAction>, contentHidden: Boolean = false): MessageActionTiers {
        val deletion = offered.firstOrNull { it in DELETIONS }
        if (contentHidden) {
            val primary = listOfNotNull(deletion)
            return MessageActionTiers(primary, offered.filterNot { it in primary })
        }
        val limit = MessageActionPolicy.MAX_PRIMARY_ACTIONS
        val candidates = CONTENT_ORDER.filter { it in offered }
        val excess = candidates.size - limit
        val dropped = if (excess > 0) OVERFLOW_ORDER.filter { it in candidates }.take(excess).toSet() else emptySet()
        val kept = candidates.filterNot { it in dropped }.take(limit)
        val primary = kept + listOfNotNull(deletion)
        return MessageActionTiers(primary, offered.filterNot { it in primary })
    }
}
