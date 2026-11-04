package me.meeshy.sdk.media

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.mediahub.ConversationMediaHubRules
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.ConversationMediaRules
import me.meeshy.sdk.model.mediahub.MediaHubAttachment
import me.meeshy.sdk.model.mediahub.MediaHubItem

/**
 * Le catalogue des médias de TOUTE la conversation, lu sur l'index (disque d'abord, hors ligne compris) : la
 * galerie y trouve un média ancien hors de la fenêtre de messages chargée. Aucune requête réseau ici — la
 * revalidation est celle de l'écran « Médias ».
 */
@Singleton
class ConversationMediaCatalog @Inject constructor(private val index: ConversationMediaHubIndex) {

    suspend fun items(
        conversationId: String,
        kind: ConversationMediaKind,
        nowMillis: Long,
        webOrigin: String,
        isHidden: (String) -> Boolean = { false },
    ): List<MediaHubItem> {
        val carriers = index.load(conversationId, kind)?.carriers.orEmpty()
        return ConversationMediaHubRules.items(carriers, kind, nowMillis, webOrigin, isHidden)
    }

    /** Ce qui vaut un préchauffage dans l'onglet Photos et vidéos : la tête visible et le récent, rien d'autre. */
    suspend fun prewarmTargets(conversationId: String, nowMillis: Long, webOrigin: String): List<MediaHubAttachment> =
        ConversationMediaRules.prewarmTargets(items(conversationId, ConversationMediaKind.VISUAL, nowMillis, webOrigin), nowMillis)
}
