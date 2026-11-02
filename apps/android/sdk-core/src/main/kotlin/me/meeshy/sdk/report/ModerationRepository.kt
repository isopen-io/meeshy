package me.meeshy.sdk.report

import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.DeletionAcknowledgement
import me.meeshy.sdk.model.ModerationAccess
import me.meeshy.sdk.model.MyPermissions
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AdminApi
import me.meeshy.sdk.net.api.ContentRemovalClient
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les droits de modération et le retrait de contenu avec motif (port de `PermissionsService` et de
 * `deleteRemovingContent`, iOS).
 *
 * **Fail-closed** : sans session, ou si les droits ne se lisent pas, [access] rend
 * [ModerationAccess.None] et aucun contrôle de modération n'est exposé. Un retrait avec motif ne part
 * qu'avec un motif non blanc — sans motif, l'appelant reste sur les `delete` sans corps, identiques
 * à l'octet près à l'ancienne requête.
 */
@Singleton
public class ModerationRepository @Inject constructor(
    private val adminApi: AdminApi,
    private val removal: ContentRemovalClient,
    private val sessionRepository: SessionRepository,
) {
    /** Mes droits relus à la source ; `null` sans session (aucune requête ne part). */
    public suspend fun myPermissions(): NetworkResult<MyPermissions>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return apiCall { adminApi.myPermissions() }
    }

    /** Ce que la modération m'ouvre : [ModerationAccess.None] à la moindre incertitude. */
    public suspend fun access(): ModerationAccess =
        ModerationAccess.from(myPermissions()?.getOrNull())

    /**
     * Retire un message avec [reason]. `null` (inerte, rien ne part) sans session, sans motif ou
     * avec un identifiant vide.
     */
    public suspend fun removeMessage(messageId: String, reason: String?): NetworkResult<DeletionAcknowledgement>? =
        remove(messageId, reason) { id, body -> removal.removeMessage(id, body) }

    /** Retire une publication ou une story avec [reason] — mêmes gardes que [removeMessage]. */
    public suspend fun removePost(postId: String, reason: String?): NetworkResult<DeletionAcknowledgement>? =
        remove(postId, reason) { id, body -> removal.removePost(id, body) }

    /** Retire un commentaire de [postId] avec [reason] — mêmes gardes que [removeMessage]. */
    public suspend fun removeComment(
        postId: String,
        commentId: String,
        reason: String?,
    ): NetworkResult<DeletionAcknowledgement>? {
        if (postId.isBlank()) return null
        return remove(commentId, reason) { id, body -> removal.removeComment(postId.trim(), id, body) }
    }

    private suspend fun remove(
        id: String,
        reason: String?,
        send: suspend (String, ContentRemovalRequest) -> NetworkResult<DeletionAcknowledgement>,
    ): NetworkResult<DeletionAcknowledgement>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        val entityId = id.trim().takeIf { it.isNotEmpty() } ?: return null
        val body = ContentRemovalRequest.forReason(reason) ?: return null
        return send(entityId, body)
    }
}
