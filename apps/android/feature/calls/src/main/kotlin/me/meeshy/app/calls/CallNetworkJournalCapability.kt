package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallNetworkJournalStore
import me.meeshy.sdk.call.CallQualityStatsFeed
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallNetworkEvent
import me.meeshy.sdk.model.call.CallNetworkJournalInput
import me.meeshy.sdk.model.call.CallNetworkJournalRecorder
import me.meeshy.sdk.model.call.CallNetworkLink
import me.meeshy.sdk.model.call.CallQualityReading
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.VideoQualityLevel
import org.webrtc.PeerConnection
import timber.log.Timber

/** Where the recorded events of a call go — the encrypted [CallNetworkJournalStore] in production. */
fun interface CallNetworkJournalSink {
    suspend fun append(events: List<CallNetworkEvent>, callId: String, startedAtMs: Long)
}

/**
 * Feeds the call's live signals to its network journal (#13676) — port of iOS `CallNetworkJournalBinding`. It only
 * LISTENS: the FSM transitions it is handed as a [CallFeatureController], the quality readings of
 * [CallQualityStatsFeed] (each also classified into its tier) and the ICE state of [WebRtcEngine]; it never touches
 * the signalling. The vocabulary and the sampling are [CallNetworkJournalRecorder]'s; the writes are kept in order.
 */
@Singleton
class CallNetworkJournalRecording internal constructor(
    private val readings: Flow<CallQualityReading?>,
    private val links: Flow<CallNetworkLink?>,
    private val sink: CallNetworkJournalSink,
    private val scope: CoroutineScope,
    private val now: () -> Long,
) : CallFeatureController {

    @Inject
    constructor(feed: CallQualityStatsFeed, engine: WebRtcEngine, store: CallNetworkJournalStore) : this(
        readings = feed.readings,
        links = engine.iceConnectionState.map(::linkOf),
        sink = CallNetworkJournalSink(store::append),
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        now = System::currentTimeMillis,
    )

    private var recorder = CallNetworkJournalRecorder.Idle
    private var feeds: Job? = null
    private val writes = Channel<Write>(Channel.UNLIMITED)

    init {
        scope.launch {
            for (write in writes) {
                try {
                    sink.append(write.events, write.callId, write.startedAtMs)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "Call network journal: write failed")
                }
            }
        }
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        record(CallNetworkJournalInput.Call(session.callId))
        record(CallNetworkJournalInput.State(next))
        if (next.isActive && recorder.callId != null) follow() else unfollow()
    }

    override fun onCleared() = unfollow()

    private fun follow() {
        if (feeds != null) return
        feeds = merge(
            links.filterNotNull().map { CallNetworkJournalInput.Link(it) },
            readings.filterNotNull().map { CallNetworkJournalInput.Reading(it) },
        ).onEach { input ->
            record(input)
            if (input is CallNetworkJournalInput.Reading) record(CallNetworkJournalInput.Tier(tierOf(input.reading)))
        }.launchIn(scope)
    }

    private fun unfollow() {
        feeds?.cancel()
        feeds = null
    }

    private fun record(input: CallNetworkJournalInput) {
        val step = recorder.reducing(input, now())
        recorder = step.recorder
        val callId = step.recorder.callId ?: return
        val startedAtMs = step.recorder.startedAtMs ?: return
        if (step.events.isNotEmpty()) writes.trySend(Write(step.events, callId, startedAtMs))
    }

    private data class Write(val events: List<CallNetworkEvent>, val callId: String, val startedAtMs: Long)

    internal companion object {
        fun linkOf(state: PeerConnection.IceConnectionState): CallNetworkLink? = when (state) {
            PeerConnection.IceConnectionState.CHECKING -> CallNetworkLink.CONNECTING
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            -> CallNetworkLink.CONNECTED
            PeerConnection.IceConnectionState.DISCONNECTED -> CallNetworkLink.DISCONNECTED
            PeerConnection.IceConnectionState.FAILED -> CallNetworkLink.FAILED
            else -> null
        }

        /** The tier of the same ladder the quality report uses (loss as a fraction). */
        fun tierOf(reading: CallQualityReading): VideoQualityLevel =
            VideoQualityLevel.from(reading.roundTripTimeMs, reading.packetLossPercent / PERCENT)

        private const val PERCENT = 100.0
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallNetworkJournalModule {
    @Binds
    @IntoSet
    fun bindCallNetworkJournalRecording(recording: CallNetworkJournalRecording): CallFeatureController
}
