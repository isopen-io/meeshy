package me.meeshy.sdk.e2ee

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatus
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatusDecoder
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationEncryptionApi
import me.meeshy.sdk.net.api.SetEncryptionModeBody
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Lire et basculer le régime de chiffrement d'une conversation (#12522) — la passerelle fait foi. */
interface ConversationEncryptionProviding {
    suspend fun status(conversationId: String): NetworkResult<ConversationEncryptionStatus>

    /** Active un mode AU REPOS ; le bout en bout n'est pas activable depuis ce téléphone (#13015). */
    suspend fun enable(conversationId: String, mode: ConversationEncryptionModeChoice): NetworkResult<ConversationEncryptionStatus>

    /** Désactive le chiffrement AU REPOS. Le bout en bout ne se désactive jamais (#12949). */
    suspend fun disable(conversationId: String): NetworkResult<ConversationEncryptionStatus>
}

/**
 * Tout ce que cette conversation a de bout en bout est APPRIS par le registre ([EndToEndRegimeLedger]) :
 * un statut e2ee servi, ou le 409 `E2EE_IRREVERSIBLE` de la passerelle. Une conversation que ce
 * téléphone sait chiffrée de bout en bout n'est ni activée ni désactivée — le refus est local, avant
 * tout réseau : une passerelle qui la servirait sans mode ne rouvre pas le clair.
 */
@Singleton
class ConversationEncryptionRepository @Inject constructor(
    private val api: ConversationEncryptionApi,
    private val ledger: EndToEndRegimeLedger,
) : ConversationEncryptionProviding {

    override suspend fun status(conversationId: String): NetworkResult<ConversationEncryptionStatus> =
        decoded(conversationId) { api.status(conversationId) }

    override suspend fun enable(
        conversationId: String,
        mode: ConversationEncryptionModeChoice,
    ): NetworkResult<ConversationEncryptionStatus> = when {
        !mode.isOfferedOnThisPhone -> NetworkResult.Failure(UNAVAILABLE_HERE)
        ledger.isSealed(conversationId) -> NetworkResult.Failure(REFUSED_IRREVERSIBLE)
        else -> decoded(conversationId) { api.enable(conversationId, SetEncryptionModeBody(mode.wire)) }
    }

    override suspend fun disable(conversationId: String): NetworkResult<ConversationEncryptionStatus> =
        if (ledger.isSealed(conversationId)) {
            NetworkResult.Failure(REFUSED_IRREVERSIBLE)
        } else {
            decoded(conversationId) { api.disable(conversationId) }
        }

    private suspend fun decoded(
        conversationId: String,
        call: suspend () -> ApiResponse<JsonObject>,
    ): NetworkResult<ConversationEncryptionStatus> =
        when (val raw = apiCall(call)) {
            is NetworkResult.Failure -> raw.also { if (it.error.code == IRREVERSIBLE) ledger.learn(conversationId) }
            is NetworkResult.Success -> ConversationEncryptionStatusDecoder.decode(raw.data)
                ?.also { if (it.isEndToEnd) ledger.learn(conversationId) }
                ?.let { NetworkResult.Success(it) }
                ?: NetworkResult.Failure(MALFORMED)
        }

    companion object {
        /** 409 de la passerelle : un tête-à-tête ou un groupe chiffré de bout en bout ne repasse jamais en clair (#12949). */
        const val IRREVERSIBLE: String = "E2EE_IRREVERSIBLE"

        /** 409 de la passerelle : une autre bascule vient de passer, l'état se relit. */
        const val REGIME_CHANGED: String = "E2EE_REGIME_CHANGED"

        const val DIRECT_ALREADY_END_TO_END: String = "E2EE_DIRECT_ALREADY_END_TO_END"

        /** Refus local : ce téléphone n'est pas encore un appareil chiffré (#13015). */
        const val NOT_AVAILABLE_ON_THIS_PHONE: String = "E2EE_NOT_AVAILABLE_ON_THIS_PHONE"

        private val MALFORMED = ApiError(message = "Réponse du régime de chiffrement invalide", code = "MALFORMED_RESPONSE")
        private val UNAVAILABLE_HERE = ApiError(message = "Le bout en bout ne s'active pas depuis ce téléphone", code = NOT_AVAILABLE_ON_THIS_PHONE)
        private val REFUSED_IRREVERSIBLE = ApiError(message = "Le bout en bout ne se quitte pas", code = IRREVERSIBLE, httpStatus = 409)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ConversationEncryptionModule {
    @Binds
    abstract fun bindConversationEncryption(repository: ConversationEncryptionRepository): ConversationEncryptionProviding
}
