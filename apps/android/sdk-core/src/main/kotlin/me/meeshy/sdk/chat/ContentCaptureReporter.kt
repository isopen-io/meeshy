package me.meeshy.sdk.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.ContentCaptureRefusal
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.net.api.ConversationChatRestApi
import me.meeshy.sdk.socket.ContentCaptureSocketEmitting
import me.meeshy.sdk.socket.EphemeralSocketEvents
import retrofit2.HttpException

/** Déclare une capture à la passerelle et rend les messages pour lesquels un avis EXISTE désormais. */
interface ContentCaptureSending {
    suspend fun send(report: ContentCaptureReport): Result<List<String>>
}

/**
 * Le socket d'abord (`message:capture-detected`), le jumeau REST (`POST /conversations/:id/messages/capture`) quand la socket
 * est absente ou muette (`NO_SOCKET`, `TIMEOUT`, accusé illisible). Le MÊME `captureId` voyage sur les deux : la passerelle
 * dédoublonne. Un refus d'ensemble du socket (non authentifié, forme refusée, non-participant, budget, conversation close)
 * ne se rejoue par AUCUN autre transport. Miroir de `ContentCaptureService` (iOS).
 */
@Singleton
class ContentCaptureReporter @Inject constructor(
    private val socket: ContentCaptureSocketEmitting,
    private val rest: ConversationChatRestApi,
) : ContentCaptureSending {

    override suspend fun send(report: ContentCaptureReport): Result<List<String>> {
        val viaSocket = socket.emit(report)
        val refusal = viaSocket.exceptionOrNull() as? ContentCaptureRefusal
        if (viaSocket.isSuccess || refusal?.isFinal == true) return viaSocket
        return viaRest(report)
    }

    private suspend fun viaRest(report: ContentCaptureReport): Result<List<String>> = try {
        val response = rest.capture(report.conversationId, report.body())
        Result.success(response.data?.noticedMessageIds.orEmpty())
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (http: HttpException) {
        Result.failure(refusalCode(http.code())?.let(::ContentCaptureRefusal) ?: http)
    } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
        Result.failure(failure)
    }

    /** 4xx = un refus, pas une panne ; 5xx reste une panne (l'appelant peut rejouer). */
    private fun refusalCode(status: Int): String? = when (status) {
        429 -> ContentCaptureRefusal.RATE_LIMITED
        403 -> ContentCaptureRefusal.NOT_A_PARTICIPANT
        in 400..499 -> "HTTP_$status"
        else -> null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ContentCaptureModule {
    @Binds
    fun sending(reporter: ContentCaptureReporter): ContentCaptureSending

    @Binds
    fun socketEmitting(events: EphemeralSocketEvents): ContentCaptureSocketEmitting
}
