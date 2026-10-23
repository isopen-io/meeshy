package me.meeshy.sdk.call

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.RtpReceiver
import java.util.concurrent.CopyOnWriteArrayList

/** Événements du pair, hors candidats ICE et pistes distantes qui ont leurs propres flux. */
public sealed interface CallEngineEvent {
    /** Le pair distant a ouvert un canal de données. */
    public data class DataChannelOpened(val channel: DataChannel) : CallEngineEvent

    /** Une renégociation est requise (piste ajoutée ou retirée) : qui ré-offre est une politique applicative. */
    public data object RenegotiationNeeded : CallEngineEvent

    /** État de connexion COMPLET du pair (ICE + DTLS), plus fin que l'état ICE seul. */
    public data class ConnectionChanged(val state: PeerConnection.PeerConnectionState) : CallEngineEvent

    public data class SignalingChanged(val state: PeerConnection.SignalingState) : CallEngineEvent

    public data class IceGatheringChanged(val state: PeerConnection.IceGatheringState) : CallEngineEvent
}

/** Les sorties observables du moteur, alimentées par l'observateur du `PeerConnection`. */
internal class CallEngineEvents {
    private val _localIceCandidates = MutableSharedFlow<IceCandidate>(extraBufferCapacity = 64)
    val localIceCandidates: SharedFlow<IceCandidate> = _localIceCandidates.asSharedFlow()

    private val _iceConnectionState = MutableStateFlow(PeerConnection.IceConnectionState.NEW)
    val iceConnectionState: StateFlow<PeerConnection.IceConnectionState> = _iceConnectionState.asStateFlow()

    private val _events = MutableSharedFlow<CallEngineEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<CallEngineEvent> = _events.asSharedFlow()

    val remoteTracks = RemoteTrackRegistry()

    private val openedChannels = CopyOnWriteArrayList<DataChannel>()
    val dataChannels: List<DataChannel> get() = openedChannels.toList()

    /** Remet l'état d'appel à zéro : le moteur est un singleton réutilisé par l'appel suivant. */
    fun reset() {
        openedChannels.clear()
        _iceConnectionState.value = PeerConnection.IceConnectionState.NEW
        remoteTracks.reset()
    }

    val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            _localIceCandidates.tryEmit(candidate)
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            _iceConnectionState.value = state
        }

        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
            remoteTracks.onAddTrack(receiver.track())
        }

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            newState?.let { _events.tryEmit(CallEngineEvent.ConnectionChanged(it)) }
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState?) {
            state?.let { _events.tryEmit(CallEngineEvent.SignalingChanged(it)) }
        }

        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
            state?.let { _events.tryEmit(CallEngineEvent.IceGatheringChanged(it)) }
        }

        override fun onDataChannel(channel: DataChannel?) {
            channel ?: return
            openedChannels += channel
            _events.tryEmit(CallEngineEvent.DataChannelOpened(channel))
        }

        override fun onRenegotiationNeeded() {
            _events.tryEmit(CallEngineEvent.RenegotiationNeeded)
        }

        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
    }
}
