package me.meeshy.app.calls

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/**
 * Runs a media action only once the runtime permissions a call needs are in
 * hand. WebRTC capture records silence / fails without RECORD_AUDIO, and it is
 * never granted by default. Mirrors iOS, where AVAudioSession prompts for the mic
 * at first media access: an OUTGOING call gates its start on the grant; an
 * INCOMING call rings first (no prompt) and gates accept — the ask-at-answer flow.
 *
 * The mic is the vital minimum; the camera is optional (video degrades to audio).
 */
@Stable
class CallPermissionGate internal constructor(
    private val isMicGranted: () -> Boolean,
    private val request: () -> Unit,
    private val pending: PendingAction,
) {
    /** Runs [action] now when the mic is granted, otherwise asks and runs it on the grant. */
    fun withMediaPermissions(action: () -> Unit) {
        if (isMicGranted()) {
            action()
        } else {
            pending.set(action)
            request()
        }
    }

    /** The one action waiting for the permission prompt's answer. */
    internal class PendingAction {
        private var action: (() -> Unit)? = null

        fun set(next: () -> Unit) {
            action = next
        }

        /** Runs the waiting action when [granted], and forgets it either way. */
        fun resolve(granted: Boolean) {
            val waiting = action
            action = null
            if (granted) waiting?.invoke()
        }
    }
}

/** The gate for a call of the given kind — camera is requested alongside the mic only for video. */
@Composable
fun rememberCallPermissionGate(isVideo: Boolean): CallPermissionGate {
    val context = LocalContext.current
    val required = remember(isVideo) { CallPermissions.required(isVideo) }
    val pending = remember { CallPermissionGate.PendingAction() }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val micGranted = grants[Manifest.permission.RECORD_AUDIO]
            ?: hasSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        pending.resolve(micGranted)
    }
    return remember(context, required, pending, launcher) {
        CallPermissionGate(
            isMicGranted = { hasSelfPermission(context, Manifest.permission.RECORD_AUDIO) },
            request = { launcher.launch(required) },
            pending = pending,
        )
    }
}

private fun hasSelfPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
