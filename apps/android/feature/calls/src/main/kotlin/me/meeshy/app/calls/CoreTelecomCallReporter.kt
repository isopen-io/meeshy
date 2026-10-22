package me.meeshy.app.calls

import android.util.Log
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomSystemDisconnectLaw
import me.meeshy.sdk.model.call.TelecomSystemRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le reporter d'appel branché sur `androidx.core.telecom` : chaque appel est une connexion
 * système (écran verrouillé, casque, montre, voiture). Il ne décide rien : les décisions sont
 * celles de `TelecomCallPolicy` (quelles transitions), de [CallTelecomSession] (quand activer)
 * et de `TelecomRequestPolicy` (que faire d'une demande du système).
 *
 * Sans téléphonie (tablette, ChromeOS) ou si le système refuse la connexion, le reporter reste
 * inerte et le flux in-app est intact. Quand le système détruit la connexion, aucune demande de
 * fin n'est émise : l'appel continue dans l'application et la grâce serveur décide.
 */
@Singleton
class CoreTelecomCallReporter @Inject constructor(
    private val gateway: TelecomCallsGateway,
    private val support: TelecomPlatformSupport,
    private val audioRoutes: CallAudioRouteProviding,
    @DefaultDispatcher dispatcher: CoroutineDispatcher,
) : TelecomCallReporter {

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _requests = MutableSharedFlow<TelecomSystemRequest>(extraBufferCapacity = REQUEST_BUFFER)

    override val requests: Flow<TelecomSystemRequest> = _requests.asSharedFlow()

    private var session: CallTelecomSession? = null
    private var job: Job? = null

    override fun begin(call: TelecomCallInfo) {
        release()
        if (!support.isSupported()) return
        val opened = CallTelecomSession(scope, call.isOutgoing)
        session = opened
        job = scope.launch {
            try {
                gateway.addCall(call, handlersOf(opened), { run(call, opened) })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Log.w(TAG, "telecom connection unavailable, in-app call only", failure)
            } finally {
                opened.markSystemEnded()
                if (session === opened) session = null
            }
        }
    }

    override fun report(update: TelecomConnectionUpdate) {
        session?.apply(update)
    }

    override fun onMediaConnected() {
        session?.onMediaConnected()
    }

    override fun release() {
        job?.cancel()
        job = null
        session?.markSystemEnded()
        session = null
    }

    private fun handlersOf(opened: CallTelecomSession) = TelecomCallHandlers(
        onAnswer = {
            opened.markSystemAnswered()
            _requests.tryEmit(TelecomSystemRequest.Answer)
            opened.holdUntilMedia()
        },
        onDisconnect = { kind ->
            TelecomSystemDisconnectLaw.requestFor(kind)?.let { _requests.tryEmit(it) }
            opened.markSystemEnded()
        },
        onSetActive = { _requests.tryEmit(TelecomSystemRequest.Hold(onHold = false)) },
        onSetInactive = { _requests.tryEmit(TelecomSystemRequest.Hold(onHold = true)) },
    )

    private suspend fun TelecomCallControl.run(call: TelecomCallInfo, opened: CallTelecomSession) = coroutineScope {
        val watchers = listOf(
            launch { isMuted.distinctUntilChanged().collect { _requests.tryEmit(TelecomSystemRequest.Mute(it)) } },
            launch { followSystemEndpoint() },
            launch { followAppRoute() },
        )
        for (command in opened.commands) execute(command, call)
        watchers.forEach { it.cancel() }
    }

    private suspend fun TelecomCallControl.execute(command: TelecomCommand, call: TelecomCallInfo) {
        when (command) {
            TelecomCommand.Activate ->
                if (call.isOutgoing) setActive() else answer(call.isVideo)
            is TelecomCommand.Disconnect -> disconnect(command.cause)
        }
    }

    private suspend fun TelecomCallControl.followSystemEndpoint() {
        currentEndpoint.map { it?.kind }.distinctUntilChanged().collect { kind ->
            TelecomAudioSync.routeToSelect(kind, audioRoutes.snapshot())?.let(audioRoutes::select)
        }
    }

    private suspend fun TelecomCallControl.followAppRoute() {
        combine(audioRoutes.routeChanges.onStart { emit(Unit) }, currentEndpoint, availableEndpoints) { _, current, available ->
            TelecomAudioSync.endpointToRequest(audioRoutes.snapshot(), current, available)
        }.collect { wanted -> wanted?.let { requestEndpoint(it) } }
    }

    private companion object {
        const val TAG = "CallTelecom"
        const val REQUEST_BUFFER = 16
    }
}
