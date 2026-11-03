package me.meeshy.app.calls

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.sdk.model.call.CallPreflight
import me.meeshy.sdk.model.call.CallPreflightDecision
import me.meeshy.sdk.model.call.IncomingCallAnswer
import me.meeshy.sdk.model.call.IncomingCallPermissionPolicy

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
    private val isCameraGranted: () -> Boolean = { true },
    private val preflight: CallPermissionPreflight? = null,
    private val scope: CoroutineScope? = null,
    internal val flow: PermissionFlow? = null,
) {
    /** Runs [action] now when the mic is granted, otherwise asks and runs it on the grant. */
    fun withMediaPermissions(action: () -> Unit) {
        if (preflight != null && scope != null) {
            scope.launch { if (preflight.microphone()) action() }
        } else if (isMicGranted()) {
            action()
        } else {
            pending.set(action)
            request()
        }
    }

    /**
     * Composer un appel (iOS `requestPermissionsThenStartCall`) : le micro est bloquant — refusé, l'appel ne part
     * pas et [onDecision] reçoit [CallPreflightDecision.MicrophoneDenied] —, la caméra ne l'est jamais : refusée,
     * l'appel part en audio avec le repli qui dit pourquoi. [onDecision] est appelé une fois, qu'on ait demandé ou non.
     */
    fun preflightOutgoing(isVideo: Boolean, onDecision: (CallPreflightDecision) -> Unit) {
        if (preflight != null && scope != null) {
            scope.launch { onDecision(preflight.outgoing(isVideo)) }
            return
        }
        val decide = { onDecision(CallPreflight.decide(isMicGranted(), isCameraGranted(), isVideo)) }
        if (isMicGranted() && (!isVideo || isCameraGranted())) {
            decide()
        } else {
            pending.setDecision(decide)
            request()
        }
    }

    /**
     * Accepter un appel entrant : les permissions sont tranchées AVANT de répondre
     * ([IncomingCallPermissionPolicy]) — micro refusé ⇒ on raccroche, caméra refusée ⇒ on répond
     * en audio. [onDecision] est appelé une fois, qu'on ait demandé ou non.
     */
    fun answerIncoming(isVideo: Boolean, onDecision: (IncomingCallAnswer) -> Unit) {
        if (preflight != null && scope != null) {
            scope.launch { onDecision(preflight.incoming(isVideo)) }
            return
        }
        val decide = {
            onDecision(IncomingCallPermissionPolicy.decide(isMicGranted(), isCameraGranted(), isVideo))
        }
        if (isMicGranted() && (!isVideo || isCameraGranted())) {
            decide()
        } else {
            pending.setDecision(decide)
            request()
        }
    }

    /** The one action waiting for the permission prompt's answer. */
    internal class PendingAction {
        private var action: (() -> Unit)? = null
        private var decision: (() -> Unit)? = null

        fun setDecision(next: () -> Unit) {
            decision = next
        }

        /** Runs the waiting decision whatever the answer was, and forgets it. */
        fun settle() {
            val waiting = decision
            decision = null
            waiting?.invoke()
        }

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

/**
 * The gate for a call. Every access goes through the single permission door: explanation sheet
 * before the system prompt, « Open Settings » card after a permanent refusal, and the call resumes
 * when the access is granted from the settings. [PermissionFlowHost] of [flow] must be composed by the screen.
 */
@Composable
fun rememberCallPermissionGate(): CallPermissionGate {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val flow = rememberPermissionFlow()
    return remember(context, scope, flow) {
        CallPermissionGate(
            isMicGranted = { hasSelfPermission(context, Manifest.permission.RECORD_AUDIO) },
            request = {},
            pending = CallPermissionGate.PendingAction(),
            isCameraGranted = { hasSelfPermission(context, Manifest.permission.CAMERA) },
            preflight = CallPermissionPreflight { nature, announcesRefusal -> flow.ensure(nature, announcesRefusal) },
            scope = scope,
            flow = flow,
        )
    }
}

private fun hasSelfPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
