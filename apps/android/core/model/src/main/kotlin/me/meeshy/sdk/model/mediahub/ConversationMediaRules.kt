package me.meeshy.sdk.model.mediahub

import me.meeshy.sdk.model.ApiMessage

/**
 * Les règles de l'INDEX PERSISTÉ des médias d'une conversation, genre par genre — miroir de
 * `CacheCoordinator+ConversationMedia` (iOS). Fonctions PURES : ce qui entre sur le disque, ce qui en sort,
 * et ce qui mérite un préchauffage.
 */
object ConversationMediaRules {

    /** Fenêtre « récent » du préchauffage : sept jours. */
    const val RECENT_WINDOW_MILLIS: Long = 7L * 24 * 60 * 60 * 1000

    /** Nombre de médias « visibles » (la tête de l'onglet) préchauffés quel que soit leur âge. */
    const val VISIBLE_PREWARM_COUNT: Int = 24

    /**
     * Ce qui a sa place sur le disque : ni vue unique, ni supprimé, ni échu. Même loi que l'écran
     * ([ConversationMediaHubRules.admits]) — un contenu que l'écran ne montrerait pas n'est jamais gardé.
     */
    fun admitted(carriers: List<ApiMessage>, nowMillis: Long): List<ApiMessage> =
        carriers.filter { ConversationMediaHubRules.admits(it, nowMillis) { false } }

    /** Retire un message de la liste de porteurs d'un genre (suppression, expiration). */
    fun dropping(carriers: List<ApiMessage>, messageId: String): List<ApiMessage> =
        carriers.filterNot { it.id == messageId }

    /** Retire UNE pièce ; le porteur part s'il ne lui reste plus rien de CE genre (jamais un fantôme). */
    fun droppingAttachment(
        carriers: List<ApiMessage>,
        kind: ConversationMediaKind,
        messageId: String,
        attachmentId: String,
    ): List<ApiMessage> = carriers.mapNotNull { carrier ->
        if (carrier.id != messageId || carrier.attachments.none { it.id == attachmentId }) return@mapNotNull carrier
        val kept = carrier.copy(attachments = carrier.attachments.filterNot { it.id == attachmentId })
        kept.takeIf { !kind.isAttachmentKind || it.attachments.any { piece -> ConversationMediaHubRules.kindOf(piece) == kind } }
    }

    /**
     * Les médias à préchauffer : ceux de la tête (visibles) ET ceux envoyés dans la fenêtre récente, jamais le
     * reste de l'historique. Un fichier chiffré ou sans adresse n'a rien à préchauffer.
     */
    fun prewarmTargets(items: List<MediaHubItem>, nowMillis: Long): List<MediaHubAttachment> =
        items.withIndex()
            .filter { (index, item) -> index < VISIBLE_PREWARM_COUNT || nowMillis - item.sentAtMillis <= RECENT_WINDOW_MILLIS }
            .mapNotNull { (_, item) -> item.attachment }
            .filter { !it.isEncrypted && it.url.isNotBlank() }
            .distinctBy { it.id }
}
