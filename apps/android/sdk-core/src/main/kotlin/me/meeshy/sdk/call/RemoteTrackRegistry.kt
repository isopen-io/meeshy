package me.meeshy.sdk.call

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.webrtc.AudioTrack
import org.webrtc.MediaStreamTrack
import org.webrtc.VideoTrack

/**
 * The current call's remote media tracks, as observed off [WebRtcEngine]'s
 * [org.webrtc.PeerConnection.Observer.onAddTrack]. [video] replays its last
 * value (a fresh [remoteVideoTracks][WebRtcEngine.remoteVideoTracks]
 * collector — e.g. `CallScreen` recomposing at the start of the NEXT call —
 * must see the current call's frame, not a blank one while the peer
 * connection renegotiates) so [reset] is mandatory on every [WebRtcEngine
 * .close]: without it, the replay cache keeps re-delivering the disposed
 * [VideoTrack] from the call that just ended to whoever subscribes next,
 * because [WebRtcEngine] is a `@Singleton` — the flow, unlike the peer
 * connection, otherwise outlives the call it belongs to.
 */
internal class RemoteTrackRegistry {
    private val _video = MutableSharedFlow<VideoTrack>(replay = 1, extraBufferCapacity = 8)
    val video: SharedFlow<VideoTrack> = _video.asSharedFlow()

    private val _audio = MutableSharedFlow<AudioTrack>(extraBufferCapacity = 8)
    val audio: SharedFlow<AudioTrack> = _audio.asSharedFlow()

    fun onAddTrack(track: MediaStreamTrack?) {
        when (track) {
            is VideoTrack -> _video.tryEmit(track)
            is AudioTrack -> _audio.tryEmit(track)
            else -> Unit
        }
    }

    /** Forgets the ended call's remote tracks — call from [WebRtcEngine.close]. */
    fun reset() {
        _video.resetReplayCache()
    }
}
