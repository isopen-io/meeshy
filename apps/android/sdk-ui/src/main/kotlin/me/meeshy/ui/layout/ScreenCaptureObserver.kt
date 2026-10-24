package me.meeshy.ui.layout

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.ui.component.permission.findActivity
import java.util.function.Consumer

/**
 * Ce que le systeme dit des captures de la fenetre — pendant Android de
 * `DeviceLayout.anyScreenIsCaptured` iOS.
 *
 * [isRecording] : une fenetre de l'app est visible dans un enregistrement d'ecran en cours (API 35,
 * `WindowManager.addScreenRecordingCallback`, quelle que soit la fenetre de l'app enregistree).
 * [screenshotCount] : captures d'ecran prises pendant que l'activite est visible (API 34,
 * `Activity.ScreenCaptureCallback`). Sous ces API : jamais rien de detecte.
 */
@Immutable
public data class ScreenCaptureState(
    public val isRecording: Boolean = false,
    public val screenshotCount: Int = 0,
) {
    public companion object {
        public val None: ScreenCaptureState = ScreenCaptureState()
    }
}

/**
 * Observe les captures de l'[activity]. [start] et [stop] sont idempotents et ne levent jamais :
 * une permission manquante ou une API absente laisse simplement l'etat a [ScreenCaptureState.None].
 */
public class ScreenCaptureObserver(private val activity: Activity) {
    private val mutableState = MutableStateFlow(ScreenCaptureState.None)
    public val state: StateFlow<ScreenCaptureState> = mutableState.asStateFlow()

    private var recordingRegistration: (() -> Unit)? = null
    private var screenshotRegistration: (() -> Unit)? = null

    public fun start() {
        if (recordingRegistration == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            recordingRegistration = runCatching {
                ScreenRecordingApi35.register(activity) { recording ->
                    mutableState.update { it.copy(isRecording = recording) }
                }
            }.getOrNull()
        }
        if (screenshotRegistration == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            screenshotRegistration = runCatching {
                ScreenshotApi34.register(activity) {
                    mutableState.update { it.copy(screenshotCount = it.screenshotCount + 1) }
                }
            }.getOrNull()
        }
    }

    public fun stop() {
        recordingRegistration?.let { unregister -> runCatching { unregister() } }
        screenshotRegistration?.let { unregister -> runCatching { unregister() } }
        recordingRegistration = null
        screenshotRegistration = null
        mutableState.update { it.copy(isRecording = false) }
    }
}

/**
 * Etat des captures de la fenetre courante, observe tant que l'appelant est compose.
 * [suppressed] (vrai pendant un appel) rend [ScreenCaptureState.None] : un appel n'est jamais
 * signale comme enregistre par ce canal.
 */
@Composable
public fun rememberScreenCaptureState(suppressed: Boolean = false): ScreenCaptureState {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() } ?: return ScreenCaptureState.None
    val observer = remember(activity) { ScreenCaptureObserver(activity) }
    DisposableEffect(observer) {
        observer.start()
        onDispose { observer.stop() }
    }
    val state by observer.state.collectAsState()
    return if (suppressed) ScreenCaptureState.None else state
}

@RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
private object ScreenRecordingApi35 {
    /** Enregistre le rappel, pousse l'etat initial, rend la desinscription. */
    fun register(activity: Activity, onChange: (Boolean) -> Unit): () -> Unit {
        val windowManager = activity.windowManager
        val callback = Consumer<Int> { state -> onChange(state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE) }
        val initial = windowManager.addScreenRecordingCallback(activity.mainExecutor, callback)
        onChange(initial == WindowManager.SCREEN_RECORDING_STATE_VISIBLE)
        return { windowManager.removeScreenRecordingCallback(callback) }
    }
}

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
private object ScreenshotApi34 {
    /** Enregistre le rappel de capture d'ecran, rend la desinscription. */
    fun register(activity: Activity, onScreenshot: () -> Unit): () -> Unit {
        val callback = Activity.ScreenCaptureCallback { onScreenshot() }
        activity.registerScreenCaptureCallback(activity.mainExecutor, callback)
        return { activity.unregisterScreenCaptureCallback(callback) }
    }
}
