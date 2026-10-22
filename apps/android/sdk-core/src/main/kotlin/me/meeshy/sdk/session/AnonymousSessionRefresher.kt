package me.meeshy.sdk.session

import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.auth.AnonymousRefreshRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AnonymousApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Renouvelle la session d'un invité (`POST /anonymous/refresh`) : la passerelle la
 * maintient active, revalide le lien de partage et rend les droits du participant
 * tels qu'ils sont MAINTENANT.
 *
 * ## Ce que ce cas d'usage ne touche JAMAIS
 *
 * Le compte inscrit. Il ne lit ni n'écrit le porte-jetons (`TokenStore`) : il n'a
 * pas même la dépendance. Le jeton de l'invité vit dans son contexte persisté
 * ([AnonymousSessionStore]), et c'est lui — pas un en-tête — que la route lit. Un
 * refus (`401` session inconnue, `410` accès retiré / lien expiré / conversation
 * close) remonte tel quel : décider d'y mettre fin, c'est
 * [AnonymousSessionRepository.leave], pas un effet de bord d'un rafraîchissement.
 *
 * Les droits rendus sont DURCIS comme à l'adhésion ([ParticipantPermissions.anonymous]) :
 * seuls messages, fichiers et images se négocient, jamais vidéos, audios, positions
 * ni liens.
 */
@Singleton
class AnonymousSessionRefresher @Inject constructor(
    private val anonymousApi: AnonymousApi,
    private val store: AnonymousSessionStore,
) {
    /**
     * Rafraîchit la session persistée. Sans session d'invité, c'est un échec
     * [NO_SESSION_CODE] : rien n'est envoyé. Sur succès le contexte durci est
     * re-persisté ; une charge sans participant garde le contexte tel quel — un
     * invité dont la réponse est illisible ne perd pas sa session.
     */
    suspend fun refresh(): NetworkResult<AnonymousSessionContext> {
        val context = store.load()
            ?: return NetworkResult.Failure(ApiError(message = "No anonymous session to refresh", code = NO_SESSION_CODE))
        return when (val result = apiCall { anonymousApi.refresh(AnonymousRefreshRequest(context.sessionToken)) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val refreshed = context.copy(
                    permissions = result.data.participant?.let {
                        ParticipantPermissions.anonymous(
                            canSendMessages = it.canSendMessages,
                            canSendFiles = it.canSendFiles,
                            canSendImages = it.canSendImages,
                        )
                    } ?: context.permissions,
                    conversationId = result.data.conversation?.id ?: context.conversationId,
                )
                store.save(refreshed)
                NetworkResult.Success(refreshed)
            }
        }
    }

    companion object {
        /** Aucune session d'invité n'est persistée : il n'y a rien à renouveler. */
        const val NO_SESSION_CODE: String = "NO_ANONYMOUS_SESSION"
    }
}
