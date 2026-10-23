package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.model.call.CallCaptionSegment
import me.meeshy.sdk.model.call.DataChannelCodec
import me.meeshy.sdk.model.call.DataChannelInbound

/**
 * Le routage du canal de données « transcription » d'UN appel (miroir de `CallManager+DataChannel`) :
 * un `bye` coupe l'appel sans attendre le fanout serveur, une entrée de sous-titres est exposée en flux,
 * tout le reste (ping de keep-alive, type inconnu d'une version future, bruit) est inerte.
 */
internal class CallDataChannelController(private val engine: WebRtcEngine) {
    private val _captions = MutableSharedFlow<CallCaptionSegment>(extraBufferCapacity = 64)

    /** Les sous-titres du pair, toujours `isLocal = false`. */
    val captions: SharedFlow<CallCaptionSegment> = _captions.asSharedFlow()

    fun observe(scope: CoroutineScope, onRemoteBye: (reason: String?) -> Unit) {
        engine.dataChannelMessages
            .onEach { route(it, onRemoteBye) }
            .launchIn(scope)
    }

    /** Annonce le raccrochage au pair par le canal ; `false` si le canal n'est pas (encore) ouvert. */
    fun sendHangupBye(reason: String? = null): Boolean =
        engine.sendDataChannelMessage(DataChannelCodec.encodeBye(reason))

    /** Envoie un sous-titre local au pair. */
    fun sendCaption(segment: CallCaptionSegment): Boolean =
        engine.sendDataChannelMessage(DataChannelCodec.encodeCaption(segment))

    private fun route(bytes: ByteArray, onRemoteBye: (String?) -> Unit) {
        when (val inbound = DataChannelCodec.decode(bytes)) {
            is DataChannelInbound.Bye -> onRemoteBye(inbound.reason)
            is DataChannelInbound.Caption -> _captions.tryEmit(inbound.segment)
            DataChannelInbound.Ignored -> Unit
        }
    }
}
