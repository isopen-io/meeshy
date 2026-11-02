package me.meeshy.sdk.e2ee.libsignal

import androidx.room.withTransaction
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.e2ee.E2eeWire
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.render.EndToEndPlaintextOverlay
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository

/**
 * L'envoi et la lecture d'un fil chiffré de bout en bout sur libsignal (#14591).
 *
 * **Le clair ne touche ni Room ni la file d'envoi** (loi `EndToEndDiskPlaintextLaw`, iOS #12999 ; la base Room n'est pas
 * chiffrée) : il est rangé au coffre E2EE sous le `cid_` AVANT que la bulle n'existe ; la bulle optimiste ne porte que
 * `[Encrypted]`, et la ligne d'outbox (`SEND_E2EE_MESSAGE`) ne porte que la conversation, le correspondant et le `cid_`.
 * Le scellement se fait à l'envoi, sur la liste d'appareils du moment (Sesame) : une ligne rejouée après un 409 ou hors
 * ligne rechiffre, jamais un chiffré périmé.
 */
@Singleton
internal class LibsignalEndToEndThread @Inject constructor(
    private val runtime: EndToEndMessagingRuntime,
    private val session: SessionRepository,
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val outboxRepository: OutboxRepository,
    private val clock: CacheClock,
) : EndToEndThreadAccess {

    override suspend fun sendText(
        conversationId: String,
        peerUserId: String,
        text: String,
        language: String?,
        sender: MeeshyUser,
        replyToId: String?,
    ): String {
        val cid = OutboxIds.cid()
        val now = clock.nowMillis()
        val content = E2eeContent.compose(text, language, replyToId, conversationId, cid, now)
        check(runtime.remember(sender.id, content, listOf(cid))) { "end-to-end plaintext could not be kept on this device" }
        val optimistic = ApiMessage(
            id = cid,
            conversationId = conversationId,
            senderId = sender.id,
            content = E2eeWire.CONTENT_PLACEHOLDER,
            originalLanguage = language,
            replyToId = replyToId,
            createdAt = Instant.ofEpochMilli(now).toString(),
            sender = ApiMessageSender(userId = sender.id, displayName = sender.displayName, username = sender.username, avatar = sender.avatar),
            clientMessageId = cid,
            isEncrypted = true,
            encryptionMode = E2eeWire.MODE,
        )
        database.withTransaction {
            messageDao.upsertAll(listOf(MessageEntityFactory.local(optimistic, now, LocalSendState.SENDING, threadEncrypted = true)))
        }
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_E2EE_MESSAGE,
                lane = OutboxLanes.forMessage(conversationId),
                targetId = conversationId,
                payload = MeeshyApi.json.encodeToString(EndToEndSendPayload(conversationId, peerUserId, cid)),
                cmid = cid,
            ),
        )
        return cid
    }

    override fun overlay(stream: Flow<CacheResult<List<LocalMessage>>>): Flow<CacheResult<List<LocalMessage>>> =
        combine(stream, runtime.plaintextVersion) { result, _ -> result }
            .map { result -> project(result) }
            .flowOn(Dispatchers.IO)

    private suspend fun project(result: CacheResult<List<LocalMessage>>): CacheResult<List<LocalMessage>> {
        val userId = session.currentUserId ?: return result
        return when (result) {
            is CacheResult.Fresh -> result.copy(value = projected(userId, result.value))
            is CacheResult.Stale -> result.copy(value = projected(userId, result.value))
            is CacheResult.Syncing -> result.copy(value = result.value?.let { projected(userId, it) })
            CacheResult.Empty -> result
        }
    }

    private suspend fun projected(userId: String, messages: List<LocalMessage>): List<LocalMessage> {
        val candidates = messages.filter { EndToEndPlaintextOverlay.isCandidate(it.message) }
        if (candidates.isEmpty()) return messages
        val entries = runtime.plaintexts(userId, candidates.flatMap { EndToEndPlaintextOverlay.keysOf(it.message) })
        if (entries.isEmpty()) return messages
        return messages.map { local -> local.copy(message = EndToEndPlaintextOverlay.apply(local.message, entries)) }
    }
}
