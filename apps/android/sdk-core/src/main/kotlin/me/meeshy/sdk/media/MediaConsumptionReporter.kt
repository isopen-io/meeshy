package me.meeshy.sdk.media

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.model.media.PlaybackStatusReport
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject
import javax.inject.Singleton

/** La consommation du lecteur sur une pièce jointe après un rapport (listenedComplete / watchedComplete). */
public data class ConsumptionUpdate(val attachmentId: String, val consumption: MeeshyMediaConsumption)

/**
 * Entonnoir unique de TOUT rapport de consommation d'un média (iOS `AttachmentStatusReporter`).
 *
 * Tout passe par l'outbox, même en ligne : deux rapports successifs sur le même média ne
 * peuvent pas arriver dans le désordre (un seul chemin, FIFO), et hors ligne les plages sont
 * gardées et envoyées plus tard. Chaque rapport est conservé tel quel (jamais fusionné) : les
 * plages de trois écoutes hors ligne sont trois passages distincts.
 *
 * [report] ne bloque jamais l'appelant (le lecteur) et ne jette jamais.
 */
@Singleton
public class MediaConsumptionReporter @Inject constructor(
    private val outbox: OutboxRepository,
    private val json: Json,
    @IoDispatcher dispatcher: CoroutineDispatcher,
) : PlaybackReportSink {

    private val queue = Channel<Pair<String, AttachmentStatusBody>>(Channel.UNLIMITED)
    private val updates = MutableSharedFlow<ConsumptionUpdate>(extraBufferCapacity = 64)

    /** Consommation mise à jour par les rapports envoyés — le lecteur y relit son état. */
    public val consumptionUpdates: SharedFlow<ConsumptionUpdate> = updates.asSharedFlow()

    init {
        CoroutineScope(SupervisorJob() + dispatcher).launch {
            for ((attachmentId, body) in queue) {
                runCatching { persist(attachmentId, body) }
            }
        }
    }

    override fun report(attachmentId: String, body: AttachmentStatusBody) {
        queue.trySend(attachmentId to body.normalized())
    }

    private suspend fun persist(attachmentId: String, body: AttachmentStatusBody) {
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.REPORT_ATTACHMENT_STATUS,
                lane = OutboxLanes.MEDIA_STATUS,
                targetId = attachmentId,
                payload = json.encodeToString(AttachmentStatusBody.serializer(), body),
            ),
        )
        PlaybackStatusReport.project(previous = null, body = body)
            ?.let { updates.tryEmit(ConsumptionUpdate(attachmentId, it)) }
    }
}

/**
 * `REPORT_ATTACHMENT_STATUS` : poste la consommation. Un échec réseau est transitoire (le
 * rapport reste en file) ; un corps illisible est définitif.
 */
public class ReportAttachmentStatusHandler @Inject constructor(
    private val mediaApi: MediaApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<AttachmentStatusBody>(row) { body ->
            apiCall {
                val response = mediaApi.reportStatus(row.targetId, body)
                if (response.success && response.data == null) response.copy(data = JsonNull) else response
            }.toSendResult()
        }
}

@Module
@InstallIn(SingletonComponent::class)
public interface MediaConsumptionModule {

    @Binds
    public fun playbackReportSink(reporter: MediaConsumptionReporter): PlaybackReportSink

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REPORT_ATTACHMENT_STATUS)
    public fun reportAttachmentStatus(handler: ReportAttachmentStatusHandler): OutboxKindHandler
}
