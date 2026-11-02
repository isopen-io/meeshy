package me.meeshy.sdk.translation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.translation.ShareTranslationBody
import me.meeshy.sdk.model.translation.ShareTranslationResult
import me.meeshy.sdk.model.translation.SharedTranslation
import me.meeshy.sdk.model.translation.SharedTranslationFilter
import me.meeshy.sdk.model.translation.SharedTranslationShareRefusal
import me.meeshy.sdk.model.translation.SharedTranslationsResult
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SharedTranslationApi
import me.meeshy.sdk.net.apiCall

/** L'issue d'un partage : le refus motivé est un cas à part, jamais une erreur générique. */
sealed interface ShareTranslationOutcome {
    /** `result.created == false` quand un autre membre l'avait déjà partagée : la sienne est rendue. */
    data class Shared(val result: ShareTranslationResult) : ShareTranslationOutcome

    /** Le compte ne partage pas (accusés coupés) ou le message a changé depuis la traduction. */
    data class Refused(val refusal: SharedTranslationShareRefusal) : ShareTranslationOutcome

    data class Failed(val error: ApiError) : ShareTranslationOutcome
}

/** Miroir de `SharedTranslationService` (iOS) : partager la sienne, lire celles des autres. */
@Singleton
class SharedTranslationRepository @Inject constructor(
    private val api: SharedTranslationApi,
) {
    suspend fun share(conversationId: String, body: ShareTranslationBody): ShareTranslationOutcome =
        when (val result = apiCall { api.share(conversationId, body) }) {
            is NetworkResult.Success -> ShareTranslationOutcome.Shared(result.data)
            is NetworkResult.Failure -> SharedTranslationShareRefusal.fromCode(result.error.code)
                ?.let { ShareTranslationOutcome.Refused(it) }
                ?: ShareTranslationOutcome.Failed(result.error)
        }

    /**
     * Ids et langues invalides écartés AVANT l'envoi ; ids par requêtes de 100. Sans id ni langue
     * valable, rien ne part. Un paquet en échec fait échouer la lecture.
     */
    suspend fun fetch(
        conversationId: String,
        messageIds: List<String>,
        languages: List<String>,
    ): NetworkResult<List<SharedTranslation>> {
        val wanted = SharedTranslationFilter.languages(languages)
        val chunks = SharedTranslationFilter.messageIdChunks(messageIds)
        if (wanted.isEmpty() || chunks.isEmpty()) return NetworkResult.Success(emptyList())
        val joinedLanguages = wanted.joinToString(",")
        val collected = mutableListOf<SharedTranslation>()
        for (chunk in chunks) {
            when (val page = apiCall { api.list(conversationId, chunk.joinToString(","), joinedLanguages) }) {
                is NetworkResult.Failure -> return page
                is NetworkResult.Success ->
                    collected += SharedTranslationsResult.decodeOrEmpty(page.data).sharedTranslations
            }
        }
        return NetworkResult.Success(collected)
    }
}
