package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.socket.CallSocialSignalManager
import javax.inject.Inject
import javax.inject.Singleton

/**
 * #16665 — the window a peer's SCREENSHOT stays on the capsule: a screenshot has no end on the
 * wire, so its chip clears itself (web `SCREENSHOT_ALERT_TTL_MS`, gateway
 * `CALL_SCREENSHOT_ALERT_TTL_MS`). [countdown] emits once, after the window, while collected.
 */
fun interface CallScreenshotResetTimer {
    fun countdown(): Flow<Unit>

    companion object {
        const val WINDOW_MS = 5_000L

        /** Production default: the real 5 s window. */
        val Default = CallScreenshotResetTimer { flow { delay(WINDOW_MS); emit(Unit) } }
    }
}

@Singleton
class RealCallScreenshotResetTimer @Inject constructor() : CallScreenshotResetTimer {
    override fun countdown(): Flow<Unit> = CallScreenshotResetTimer.Default.countdown()
}

/**
 * #16665 — the screenshots taken on THIS device while the app is visible, fed by the activity's
 * `ScreenCaptureWatcher` (API 34+, inert below). The call relays each one as
 * `call:screen-capture-detected { kind: screenshot }` — iOS `CallAppStateObserver` parity.
 */
interface CallScreenshotSignals {
    val captures: Flow<Unit>

    companion object {
        val None: CallScreenshotSignals = object : CallScreenshotSignals {
            override val captures: Flow<Unit> = emptyFlow()
        }
    }
}

/** The process-wide relay the activity reports into and the call listens to. */
@Singleton
class AppScreenshotSignals @Inject constructor() : CallScreenshotSignals {
    private val relay = MutableSharedFlow<Unit>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    override val captures: Flow<Unit> = relay.asSharedFlow()

    fun report() {
        relay.tryEmit(Unit)
    }
}

/** #16665 — the bounds of the consented call recording, for the live journal. */
interface CallRecordingMoments {
    val events: Flow<CallRecordingSocketEvent>

    companion object {
        val None: CallRecordingMoments = object : CallRecordingMoments {
            override val events: Flow<CallRecordingSocketEvent> = emptyFlow()
        }
    }
}

@Singleton
class SocialCallRecordingMoments @Inject constructor(social: CallSocialSignalManager) : CallRecordingMoments {
    override val events: Flow<CallRecordingSocketEvent> = social.recordingEvents
}

@Module
@InstallIn(SingletonComponent::class)
interface CallScreenshotSeamsModule {
    @Binds
    fun bindCallScreenshotResetTimer(impl: RealCallScreenshotResetTimer): CallScreenshotResetTimer

    @Binds
    fun bindCallScreenshotSignals(impl: AppScreenshotSignals): CallScreenshotSignals

    @Binds
    fun bindCallRecordingMoments(impl: SocialCallRecordingMoments): CallRecordingMoments
}
