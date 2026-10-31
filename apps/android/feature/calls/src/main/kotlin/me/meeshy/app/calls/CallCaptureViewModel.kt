package me.meeshy.app.calls

import android.content.Context
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import me.meeshy.feature.calls.R
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.call.montage.CallCaptureStatus

/** Ce qu'une issue de capture dit à l'utilisateur, miroir de `CallCaptureCopy.outcome` (iOS) ; `null` : rien. */
internal object CallCaptureCopy {
    @StringRes
    fun outcome(status: CallCaptureStatus): Int? = when (status) {
        CallCaptureStatus.Idle, CallCaptureStatus.Working -> null
        CallCaptureStatus.Saved -> R.string.call_capture_saved
        is CallCaptureStatus.FacesSaved -> R.string.call_capture_faces_saved
        CallCaptureStatus.VideoSaved -> R.string.call_capture_video_saved
        CallCaptureStatus.Denied -> R.string.call_capture_denied
        CallCaptureStatus.NoVideo -> R.string.call_capture_no_video
        CallCaptureStatus.Failed -> R.string.call_capture_failed
    }

    /** La phrase dite pour [status] : « 3 visages enregistrés » porte son compte. */
    fun message(context: Context, status: CallCaptureStatus): String? {
        val text = outcome(status) ?: return null
        return if (status is CallCaptureStatus.FacesSaved) context.getString(text, status.count) else context.getString(text)
    }
}

/**
 * La capture vit avec l'écran d'appel : le contrôleur se branche aux pistes à l'entrée du mode Montage et
 * s'en débranche à sa sortie. Les issues se disent par le canal des toasts de l'appel (lus par TalkBack)
 * et se sentent : une prise, un début et une fin de film tapent un coup moyen, un enregistrement réussi un
 * succès (iOS `HapticFeedback`).
 */
@HiltViewModel
class CallCaptureViewModel @Inject constructor(
    gallery: CaptureGallery,
    @ApplicationContext private val context: Context,
    private val toasts: CallToastBus,
    private val haptics: CallHaptics,
    clock: CallClock,
) : ViewModel() {
    val controller = CallCaptureController(
        frames = CallCaptureFrameGrabber(),
        painter = CallCapturePainter(),
        saver = GalleryCallCaptureSaver(gallery),
        recorders = { CallCaptureRecorder(context.cacheDir) },
        scope = viewModelScope,
        clock = clock::nowMs,
        stamp = { SimpleDateFormat(STAMP_PATTERN, Locale.US).format(Date()) },
    )

    init {
        controller.state.map { it.status }.distinctUntilChanged().onEach(::announce).launchIn(viewModelScope)
        controller.state.map { it.flashCount to it.isRecording }.distinctUntilChanged().drop(1)
            .onEach { haptics.play(CallHapticKind.Medium) }
            .launchIn(viewModelScope)
    }

    private fun announce(status: CallCaptureStatus) {
        val message = CallCaptureCopy.message(context, status) ?: return
        if (status.isError == true) toasts.error(message) else toasts.success(message)
        if (status.isError == false) haptics.play(CallHapticKind.Success)
    }

    override fun onCleared() = controller.stop()

    private companion object {
        const val STAMP_PATTERN = "yyyyMMdd-HHmmss-SSS"
    }
}
