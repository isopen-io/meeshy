package me.meeshy.sdk.call

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallRecordingAdmission
import me.meeshy.sdk.model.call.CallRecordingCapture
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.sdk.model.call.CallRecordingPhase
import me.meeshy.sdk.model.call.CallRecordingRefusal
import me.meeshy.sdk.model.call.CallRecordingReduction
import me.meeshy.sdk.model.call.CallRecordingRules
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.model.call.CallRecordingState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CallRecordingApi
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'enregistrement d'un appel, côté appareil : demander, consentir, montrer à TOUS qu'on
 * enregistre, capter chez l'enregistreur, puis déposer le fichier et le rattacher à la bulle.
 *
 * La passerelle est l'autorité. Ce contrôleur ne démarre JAMAIS la capture sur sa propre
 * décision : seule la diffusion `call:recording-started` qui nomme ce lecteur enregistreur
 * l'allume, et toute diffusion d'arrêt (refus, délai de 30 s, arrivée d'un participant, fin
 * d'appel) l'éteint. Les règles sont [CallRecordingRules] ; ici, les effets. Miroir de
 * `CallRecordingController` (iOS) et de `call-recording.ts` (web).
 */
@Singleton
class CallRecordingController internal constructor(
    private val signals: CallRecordingSignals,
    private val capturer: CallRecordingCapturer,
    private val uploader: CallRecordingUploader,
    private val linker: CallRecordingApi,
    private val viewer: CallRecordingViewer,
    private val encryption: CallRecordingEncryptionGate,
    private val scope: CoroutineScope,
    private val wait: suspend (Long) -> Unit,
    private val fileDirectory: () -> File,
) {
    @Inject
    constructor(
        signals: CallRecordingSignals,
        capturer: CallRecordingCapturer,
        uploader: CallRecordingUploader,
        linker: CallRecordingApi,
        viewer: CallRecordingViewer,
        encryption: CallRecordingEncryptionGate,
    ) : this(
        signals, capturer, uploader, linker, viewer, encryption,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
        { delay(it) },
        { File(System.getProperty("java.io.tmpdir") ?: ".") },
    )

    private val _state = MutableStateFlow(CallRecordingState())
    val state: StateFlow<CallRecordingState> = _state.asStateFlow()

    @Volatile
    var host: CallRecordingHost? = null

    private class ActiveCapture(val callId: String, val recordingId: String, val file: File)

    @Volatile
    private var activeCapture: ActiveCapture? = null

    private var saving: Job? = null

    init {
        scope.launch {
            signals.events.collect { event ->
                try {
                    val reduction = CallRecordingRules.onSocketEvent(_state.value, event, host?.recordingCallId, viewer.id())
                    _state.value = reduction.state
                    applyEffects(reduction)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    // une diffusion illisible ne doit pas éteindre l'écoute
                }
            }
        }
    }

    /** Le bouton Enregistrer n'est proposé qu'une fois l'appel établi, et si l'appareil sait capter. */
    fun mayRequest(): Boolean = capturer.isAvailable && host?.isEstablished == true && !_state.value.phase.isActive

    fun request(kind: CallRecordingKind): Job? {
        val callHost = host ?: return null
        val callId = callHost.recordingCallId
        if (callId == null || !callHost.isEstablished) return null
        val asking = CallRecordingRules.ask(_state.value, callId, kind) ?: return null
        _state.value = asking
        return scope.launch {
            val admission = CallRecordingRules.admission(
                connected = true,
                callId = callId,
                endToEnd = encryption.isEndToEnd(callHost.conversationId),
            )
            if (admission == CallRecordingAdmission.EndToEnd) {
                _state.update { CallRecordingRules.refusedEndToEnd(CallRecordingRules.stop(it).state) }
                return@launch
            }
            val acked = signals.request(callId, kind)
            _state.update { current ->
                acked.fold(
                    onSuccess = { CallRecordingRules.askAccepted(current, callId, it, viewer.id().orEmpty()) },
                    onFailure = { CallRecordingRules.askRefused(current, callId, (it as? CallRecordingRefusal)?.code ?: "INTERNAL_ERROR") },
                )
            }
        }
    }

    fun answer(accepted: Boolean): Job? {
        val pending = _state.value.phase as? CallRecordingPhase.Pending ?: return null
        if (!CallRecordingRules.mayAnswer(_state.value)) return null
        _state.update { CallRecordingRules.answered(it) }
        return scope.launch { signals.answer(pending.callId, pending.recordingId, accepted) }
    }

    fun stop(): Job? {
        val reduction = CallRecordingRules.stop(_state.value)
        _state.value = reduction.state
        return applyEffects(reduction)
    }

    fun dismissNotice() {
        _state.update { CallRecordingRules.withNotice(it, null) }
    }

    fun callEnded() {
        val reduction = CallRecordingRules.callEnded(_state.value)
        _state.value = reduction.state
        applyEffects(reduction)
    }

    private fun applyEffects(reduction: CallRecordingReduction): Job? {
        when (val capture = reduction.capture) {
            CallRecordingCapture.None -> Unit
            is CallRecordingCapture.Begin -> beginCapture(capture)
            CallRecordingCapture.Finish -> finishCapture()
        }
        return reduction.emitStopFor?.let { (callId, recordingId) -> scope.launch { signals.stop(callId, recordingId) } }
    }

    private fun beginCapture(capture: CallRecordingCapture.Begin) {
        val extension = if (capture.kind == CallRecordingKind.VIDEO) "mp4" else "m4a"
        val file = File(fileDirectory(), "appel-${capture.callId}-${capture.recordingId}.$extension")
        if (capturer.start(file, capture.kind)) {
            activeCapture = ActiveCapture(capture.callId, capture.recordingId, file)
            return
        }
        val failed = CallRecordingRules.captureFailed(_state.value)
        _state.value = failed.state
        failed.emitStopFor?.let { (callId, recordingId) -> scope.launch { signals.stop(callId, recordingId) } }
    }

    private fun finishCapture() {
        val capture = activeCapture ?: return
        activeCapture = null
        val file = capturer.stop() ?: return
        saving = scope.launch { save(capture.callId, capture.recordingId, file) }
    }

    private suspend fun save(callId: String, recordingId: String, file: File) {
        val mime = if (file.extension == "mp4") "video/mp4" else "audio/mp4"
        try {
            val attachmentId = uploader.upload(file, mime).getOrThrow()
            val linked = linker.link(callId, recordingId, attachmentId, wait)
            _state.update { CallRecordingRules.withNotice(it, if (linked is NetworkResult.Success) CallRecordingNotice.Saved else CallRecordingNotice.SaveFailed) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            _state.update { CallRecordingRules.withNotice(it, CallRecordingNotice.SaveFailed) }
        } finally {
            file.delete()
        }
    }
}
