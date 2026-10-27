package me.meeshy.sdk.mediahub

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.session.PerAccountCache

/** Où se charge la photo d'un fond : la vignette sert d'attente, le plein format de rendu. */
data class BackgroundPhotoSource(val thumbnailUrl: String?, val fullUrl: String)

/**
 * D'où vient la photo d'un fond (parité `ConversationBackgroundPhoto.resolve`, iOS) : la pièce connue d'abord (choisie
 * ici, ou déjà vue dans l'index des médias), à défaut la route de téléchargement de la pièce, qui vérifie
 * l'appartenance à CHAQUE lecture — un ancien membre ne la voit plus, le chargement échoue, le fond retombe sur Signature.
 * Mémoire de processus bornée, propre au compte.
 */
@Singleton
class ConversationBackgroundPhotos @Inject constructor(
    private val index: ConversationMediaHubIndex,
) : PerAccountCache {
    private val remembered = ConcurrentHashMap<String, BackgroundPhotoSource>()

    fun remember(attachmentId: String, source: BackgroundPhotoSource) {
        if (remembered.size >= CAPACITY) remembered.keys.firstOrNull()?.let(remembered::remove)
        remembered[attachmentId] = source
    }

    fun resolve(conversationId: String, attachmentId: String, attachmentRouteBase: String): BackgroundPhotoSource {
        remembered[attachmentId]?.let { return it }
        index.read(conversationId, ConversationMediaKind.VISUAL)?.carriers.orEmpty()
            .firstNotNullOfOrNull { carrier -> carrier.attachments.firstOrNull { it.id == attachmentId } }
            ?.let { piece -> piece.fileUrl?.let { return BackgroundPhotoSource(piece.thumbnailUrl, it) } }
        return BackgroundPhotoSource(null, attachmentRouteBase.trimEnd('/') + "/" + attachmentId)
    }

    override suspend fun clear() = remembered.clear()

    private companion object {
        const val CAPACITY = 24
    }
}
