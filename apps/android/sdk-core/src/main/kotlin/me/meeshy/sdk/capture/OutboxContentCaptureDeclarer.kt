package me.meeshy.sdk.capture

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.chat.ContentCaptureSending
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.model.analytics.capture.ContentCaptureDispatchOutcome
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxScheduler
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload

/** Déclare une ou plusieurs captures sans jamais les perdre. Miroir de `ContentCaptureDeclaring` (iOS). */
public fun interface ContentCaptureDeclaring {
    public fun declare(reports: List<ContentCaptureReport>)
}

/** La charge de la ligne [OutboxKind.REPORT_CONTENT_CAPTURE] : la déclaration telle qu'elle partira. */
@Serializable
public data class ReportContentCapturePayload(
    val conversationId: String,
    val messageIds: List<String>,
    val kind: String,
    val captureId: String,
) {
    public fun report(): ContentCaptureReport? {
        val sort = ContentCaptureKind.entries.firstOrNull { it.wire == kind } ?: return null
        return ContentCaptureReport(conversationId, messageIds, sort, captureId)
    }

    public companion object {
        public fun of(report: ContentCaptureReport): ReportContentCapturePayload =
            ReportContentCapturePayload(report.conversationId, report.messageIds, report.kind.wire, report.captureId)
    }
}

/**
 * Chaque déclaration entre dans la file hors ligne ([OutboxKind.REPORT_CONTENT_CAPTURE]) : persistée, elle survit à
 * l'arrière-plan, à la perte du réseau et au relancement, et se rejoue avec le recul exponentiel de la file tant que la
 * passerelle l'accepte (24 h après la lecture) ; seul un refus FINAL la fait partir. La file est vidée après
 * [readSettleDelayMs], le temps que l'accusé de lecture posé à l'instant de la capture précède la déclaration.
 * Miroir de `OutboxContentCaptureDeclarer` (iOS).
 */
@Singleton
public class OutboxContentCaptureDeclarer @Inject constructor(
    private val outbox: OutboxRepository,
    private val json: Json,
    private val scheduler: OutboxScheduler,
    @IoDispatcher dispatcher: CoroutineDispatcher,
) : ContentCaptureDeclaring {

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    override fun declare(reports: List<ContentCaptureReport>) {
        if (reports.isEmpty()) return
        scope.launch {
            reports.forEach { report ->
                try {
                    outbox.enqueue(
                        OutboxMutation(
                            kind = OutboxKind.REPORT_CONTENT_CAPTURE,
                            lane = OutboxLanes.CAPTURE,
                            targetId = report.conversationId,
                            payload = json.encodeToString(ReportContentCapturePayload.serializer(), ReportContentCapturePayload.of(report)),
                        ),
                    )
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (@Suppress("TooGenericExceptionCaught") ignored: Exception) {
                    // Une déclaration non mise en file ne doit jamais faire tomber les suivantes.
                }
            }
            delay(READ_SETTLE_DELAY_MS)
            scheduler.flushNow()
        }
    }

    public companion object {
        public const val READ_SETTLE_DELAY_MS: Long = 1_500
    }
}

/**
 * `REPORT_CONTENT_CAPTURE` : déclare la capture à la passerelle (socket d'abord, REST ensuite, même `captureId`).
 * [ContentCaptureDispatchOutcome] tranche : jugée → la ligne part ; refus FINAL → elle part sans rien annoncer ; budget
 * dépassé ou message jugé mais pas encore annoncé → rejeu. Une panne du transport ne coûte aucun essai.
 */
public class ReportContentCaptureHandler @Inject constructor(
    private val sender: ContentCaptureSending,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ReportContentCapturePayload>(row) { payload ->
            val report = payload.report()
            if (report == null) SendResult.PermanentFailure("Bad payload: kind ${payload.kind}", unreadable = true) else outcome(report, row.attempts)
        }

    private suspend fun outcome(report: ContentCaptureReport, attempts: Int): SendResult {
        val result = sender.send(report)
        return when (ContentCaptureDispatchOutcome.of(result, report.messageIds, attempts)) {
            ContentCaptureDispatchOutcome.DONE -> SendResult.Success
            ContentCaptureDispatchOutcome.DROP -> SendResult.PermanentFailure("Capture declaration refused for good")
            ContentCaptureDispatchOutcome.RETRY ->
                if (result.exceptionOrNull() is IOException) SendResult.TransportFailure else SendResult.TransientFailure
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface ContentCaptureDeclarationModule {

    @Binds
    public fun declaring(declarer: OutboxContentCaptureDeclarer): ContentCaptureDeclaring

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REPORT_CONTENT_CAPTURE)
    public fun reportContentCapture(handler: ReportContentCaptureHandler): OutboxKindHandler
}
