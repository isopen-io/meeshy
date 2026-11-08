package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationDetailsApi
import me.meeshy.sdk.net.api.UpdateConversationDetailsRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.CreateConversationPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.UpdateConversationPayload
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import retrofit2.Retrofit
import javax.inject.Inject

/**
 * `CREATE_CONVERSATION` : crée la conversation mise en file hors ligne, puis remplace la ligne optimiste
 * (`pending_<uuid>`, la cible de la ligne) par celle du serveur, sans doublon. Un refus définitif ou des essais épuisés
 * retirent la ligne optimiste et préviennent l'écran ([ConversationRepository.discardPending]).
 */
public class CreateConversationHandler @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<CreateConversationPayload>(row) { payload ->
            when (val created = conversationRepository.create(payload.type, payload.title, payload.participantIds, payload.encryptionMode)) {
                is NetworkResult.Success -> {
                    conversationRepository.reconcileCreated(row.targetId, created.data)
                    SendResult.Success
                }
                is NetworkResult.Failure -> created.toSendResult()
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        conversationRepository.discardPending(row.targetId)
    }
}

/** `UPDATE_CONVERSATION` : pousse le titre, la description et l'avatar changés (les champs absents restent intacts). */
public class UpdateConversationHandler @Inject constructor(
    private val detailsApi: ConversationDetailsApi,
    private val conversationRepository: ConversationRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<UpdateConversationPayload>(row) { payload ->
            val body = UpdateConversationDetailsRequest(payload.title, payload.description, payload.avatar)
            apiCall { detailsApi.updateDetails(row.targetId, body) }.toSendResult(row.targetId)
        }

    /** Le serveur a refusé : la liste relit la conversation, qui reprend ses vraies valeurs. */
    override suspend fun onExhausted(row: OutboxEntity) {
        runCatching { conversationRepository.getById(row.targetId) }
            .getOrNull()
            ?.let { (it as? NetworkResult.Success)?.data }
            ?.let { conversationRepository.rememberServed(it) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface ConversationKindsSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.CREATE_CONVERSATION)
    public fun createConversation(handler: CreateConversationHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_CONVERSATION)
    public fun updateConversation(handler: UpdateConversationHandler): OutboxKindHandler
}

@Module
@InstallIn(SingletonComponent::class)
public object ConversationDetailsApiModule {

    @Provides
    public fun conversationDetailsApi(retrofit: Retrofit): ConversationDetailsApi =
        retrofit.create(ConversationDetailsApi::class.java)
}
