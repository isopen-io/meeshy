package me.meeshy.sdk.mediahub

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Où se charge la photo d'un fond : la vignette sert d'attente, le plein format de rendu. [authenticated] : l'adresse
 * est la route par identifiant de la passerelle, qui exige l'identité du lecteur (`GET /attachments/:id`).
 */
data class BackgroundPhotoSource(val thumbnailUrl: String?, val fullUrl: String, val authenticated: Boolean = false)

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

    fun resolve(conversationId: String, attachmentId: String, apiBaseUrl: String): BackgroundPhotoSource {
        remembered[attachmentId]?.let { return it }
        index.read(conversationId, ConversationMediaKind.VISUAL)?.carriers.orEmpty()
            .firstNotNullOfOrNull { carrier -> carrier.attachments.firstOrNull { it.id == attachmentId } }
            ?.let { piece ->
                piece.fileUrl?.let { url ->
                    return BackgroundPhotoSource(piece.thumbnailUrl?.let { resolveMediaUrl(it, apiBaseUrl) }, resolveMediaUrl(url, apiBaseUrl))
                }
            }
        return BackgroundPhotoSource(null, apiBaseUrl.trimEnd('/') + "/attachments/" + attachmentId, authenticated = true)
    }

    override suspend fun clear() = remembered.clear()

    private companion object {
        const val CAPACITY = 24
    }
}
