package me.meeshy.app.calls

import android.content.Context
import android.net.Uri
import android.telecom.DisconnectCause
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallsManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallAudioRouteKind
import me.meeshy.sdk.model.call.TelecomDisconnectCause
import me.meeshy.sdk.model.call.TelecomSystemDisconnectKind
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La seule classe qui parle `androidx.core.telecom` : elle enregistre l'application auprès du
 * système (compte d'appel auto-géré), ouvre la connexion de chaque appel (`addCall`, entrant ou
 * sortant) et traduit la portée de contrôle en [TelecomCallControl]. Colle sans décision : les
 * décisions vivent dans la loi pure, [CallTelecomSession] et [CoreTelecomCallReporter].
 */
@Singleton
class JetpackTelecomCallsGateway @Inject constructor(
    @ApplicationContext private val context: Context,
) : TelecomCallsGateway {

    private val callsManager: CallsManager by lazy { CallsManager(context) }
    private var registered = false

    @Synchronized
    private fun ensureRegistered() {
        if (registered) return
        callsManager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE or CallsManager.CAPABILITY_SUPPORTS_VIDEO_CALLING)
        registered = true
    }

    override suspend fun addCall(
        info: TelecomCallInfo,
        handlers: TelecomCallHandlers,
        block: suspend TelecomCallControl.() -> Unit,
    ) {
        ensureRegistered()
        val attributes = CallAttributesCompat(
            info.peerName.ifBlank { info.peerId },
            Uri.fromParts(ADDRESS_SCHEME, info.peerId.ifBlank { UNKNOWN_PEER }, null),
            if (info.isOutgoing) CallAttributesCompat.DIRECTION_OUTGOING else CallAttributesCompat.DIRECTION_INCOMING,
            if (info.isVideo) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
        )
        coroutineScope {
            val callScope = this
            callsManager.addCall(
                attributes,
                { _ -> handlers.onAnswer() },
                { cause -> handlers.onDisconnect(disconnectKindOf(cause.code)) },
                { handlers.onSetActive() },
                { handlers.onSetInactive() },
            ) {
                val control = ScopeControl(this)
                callScope.launch { block(control) }
            }
            callScope.coroutineContext[Job]?.cancelChildren()
        }
    }

    private class ScopeControl(private val scope: CallControlScope) : TelecomCallControl {

        override suspend fun answer(isVideo: Boolean): Boolean = scope.answer(
            if (isVideo) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
        ) is CallControlResult.Success

        override suspend fun setActive(): Boolean = scope.setActive() is CallControlResult.Success

        override suspend fun disconnect(cause: TelecomDisconnectCause): Boolean =
            scope.disconnect(DisconnectCause(platformCodeOf(cause))) is CallControlResult.Success

        override suspend fun requestEndpoint(endpoint: TelecomEndpoint): Boolean =
            (endpoint.token as? CallEndpointCompat)
                ?.let { scope.requestEndpointChange(it) is CallControlResult.Success } ?: false

        override val isMuted: Flow<Boolean> get() = scope.isMuted

        override val currentEndpoint: Flow<TelecomEndpoint?>
            get() = scope.currentCallEndpoint.map { endpointOf(it) }

        override val availableEndpoints: Flow<List<TelecomEndpoint>>
            get() = scope.availableEndpoints.map { list -> list.map(::endpointOf) }
    }

    internal companion object {
        private const val ADDRESS_SCHEME = "meeshy"
        private const val UNKNOWN_PEER = "unknown"

        fun endpointOf(endpoint: CallEndpointCompat): TelecomEndpoint =
            TelecomEndpoint(endpointKindOf(endpoint.type), endpoint)

        fun endpointKindOf(type: Int): CallAudioRouteKind = when (type) {
            CallEndpointCompat.TYPE_EARPIECE -> CallAudioRouteKind.Earpiece
            CallEndpointCompat.TYPE_SPEAKER -> CallAudioRouteKind.Speaker
            CallEndpointCompat.TYPE_BLUETOOTH -> CallAudioRouteKind.Bluetooth
            CallEndpointCompat.TYPE_WIRED_HEADSET -> CallAudioRouteKind.Wired
            else -> CallAudioRouteKind.Other
        }

        fun platformCodeOf(cause: TelecomDisconnectCause): Int = when (cause) {
            TelecomDisconnectCause.Local -> DisconnectCause.LOCAL
            TelecomDisconnectCause.Remote -> DisconnectCause.REMOTE
            TelecomDisconnectCause.Rejected -> DisconnectCause.REJECTED
            TelecomDisconnectCause.Missed -> DisconnectCause.MISSED
            TelecomDisconnectCause.Busy -> DisconnectCause.BUSY
            TelecomDisconnectCause.Error -> DisconnectCause.ERROR
        }

        fun disconnectKindOf(code: Int): TelecomSystemDisconnectKind = when (code) {
            DisconnectCause.LOCAL -> TelecomSystemDisconnectKind.Local
            DisconnectCause.REMOTE -> TelecomSystemDisconnectKind.Remote
            DisconnectCause.REJECTED -> TelecomSystemDisconnectKind.Rejected
            DisconnectCause.MISSED -> TelecomSystemDisconnectKind.Missed
            DisconnectCause.BUSY -> TelecomSystemDisconnectKind.Busy
            DisconnectCause.CANCELED -> TelecomSystemDisconnectKind.Canceled
            DisconnectCause.RESTRICTED -> TelecomSystemDisconnectKind.Restricted
            DisconnectCause.ERROR -> TelecomSystemDisconnectKind.Error
            else -> TelecomSystemDisconnectKind.Unknown
        }
    }
}
