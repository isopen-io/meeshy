package me.meeshy.app.calls

import android.content.Context
import android.os.Build
import android.view.WindowManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.emptyFlow
import java.util.function.Consumer
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the OS "is this app's screen being recorded?" signal: [states]
 * emits the capture state while collected — the current state at subscription,
 * then one emission per change. The [CallViewModel] relays each edge as
 * `call:screen-capture-detected` so the PEER gets the privacy alert the three
 * platforms now display (iOS parity: `UIScreen.capturedDidChangeNotification`
 * → `emitCallScreenCaptureDetected`).
 *
 * Detection needs Android 15 (`WindowManager.addScreenRecordingCallback`, API
 * 35, permission `DETECT_SCREEN_RECORDING`); on older OS versions [states]
 * never emits — undetectable is silence, never a false "not capturing" claim.
 * Injectable seam for the same reason as [CallHeartbeatTicker]: deterministic
 * flow emissions in unit tests.
 */
interface ScreenRecordingDetector {
    val states: Flow<Boolean>
}

@Singleton
class RealScreenRecordingDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) : ScreenRecordingDetector {
    override val states: Flow<Boolean> =
        if (Build.VERSION.SDK_INT >= 35) recordingCallbacks() else emptyFlow()

    private fun recordingCallbacks(): Flow<Boolean> = callbackFlow {
        val windowManager = context.getSystemService(WindowManager::class.java)
        if (windowManager == null) {
            close()
            return@callbackFlow
        }
        val callback = Consumer<Int> { state ->
            trySend(state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE)
        }
        val initialState = windowManager.addScreenRecordingCallback(context.mainExecutor, callback)
        trySend(initialState == WindowManager.SCREEN_RECORDING_STATE_VISIBLE)
        awaitClose { windowManager.removeScreenRecordingCallback(callback) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ScreenRecordingDetectorModule {
    @Binds
    fun bindScreenRecordingDetector(impl: RealScreenRecordingDetector): ScreenRecordingDetector
}
