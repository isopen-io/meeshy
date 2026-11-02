package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConsumeAfterReadPayload
import me.meeshy.sdk.outbox.ConsumeViewOncePayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import timber.log.Timber

/**
 * Ce que le lecteur CONSOMME d'un message protégé (#13995) — miroir de iOS `AfterReadConsumption`
 * et `MessageService.consumeViewOnce` :
 *
 * - **la flamme-œil** vue puis quittée disparaît d'abord ICI (le même effet local qu'un
 *   `message:expired` servi), puis le serveur l'applique à ses autres appareils par l'outbox, qui la
 *   rejoue hors ligne ;
 * - **la vue unique** lue et refermée consomme son compteur serveur, par l'outbox aussi.
 *
 * La sortie d'un écran est synchrone et son scope meurt avec lui : le travail part donc sur un scope
 * de l'application, jamais sur celui du fil.
 */
@Singleton
class MessageConsumption internal constructor(
    private val outbox: OutboxRepository,
    private val expireLocally: suspend (List<String>) -> Unit,
    private val flush: OutboxFlushScheduler,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        outbox: OutboxRepository,
        deltas: MessageDeltaApplier,
        flush: OutboxFlushScheduler,
    ) : this(outbox, deltas::expireLocally, flush, CoroutineScope(SupervisorJob() + Dispatchers.IO))

    /** La flamme-œil : [messageIds] lues dans [conversationId] quittent le cache, puis le serveur. */
    fun consumeAfterRead(conversationId: String, messageIds: List<String>) {
        if (messageIds.isEmpty()) return
        scope.launch { consumeAfterReadNow(conversationId, messageIds) }
    }

    /** La vue unique [messageId] de [conversationId] lue et refermée : son compteur serveur se consomme. */
    fun consumeViewOnce(conversationId: String, messageId: String) {
        scope.launch { consumeViewOnceNow(conversationId, messageId) }
    }

    internal suspend fun consumeAfterReadNow(conversationId: String, messageIds: List<String>) {
        if (messageIds.isEmpty()) return
        runCatching {
            expireLocally(messageIds)
            messageIds.chunked(AFTER_READ_CONSUME_MAX_IDS).forEach { chunk ->
                outbox.enqueue(
                    OutboxMutation(
                        kind = OutboxKind.CONSUME_AFTER_READ,
                        lane = OutboxLanes.CONSUMPTION,
                        targetId = conversationId,
                        payload = MeeshyApi.json.encodeToString(
                            ConsumeAfterReadPayload.serializer(),
                            ConsumeAfterReadPayload(chunk),
                        ),
                    ),
                )
            }
            flush.schedule()
        }.onFailure { Timber.w(it, "consumeAfterRead failed conv=%s", conversationId) }
    }

    internal suspend fun consumeViewOnceNow(conversationId: String, messageId: String) {
        runCatching {
            outbox.enqueue(
                OutboxMutation(
                    kind = OutboxKind.CONSUME_VIEW_ONCE,
                    lane = OutboxLanes.CONSUMPTION,
                    targetId = messageId,
                    payload = MeeshyApi.json.encodeToString(
                        ConsumeViewOncePayload.serializer(),
                        ConsumeViewOncePayload(conversationId),
                    ),
                ),
            )
            flush.schedule()
        }.onFailure { Timber.w(it, "consumeViewOnce failed message=%s", messageId) }
    }

    internal companion object {
        /** `AFTER_READ_CONSUME_MAX_IDS` (`packages/shared/types/api-schemas`). */
        const val AFTER_READ_CONSUME_MAX_IDS: Int = 200
    }
}
