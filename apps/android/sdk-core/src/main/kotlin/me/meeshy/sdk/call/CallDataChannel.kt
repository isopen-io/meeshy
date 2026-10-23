package me.meeshy.sdk.call

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.DataChannelCodec
import org.webrtc.DataChannel
import java.nio.ByteBuffer

/**
 * Le canal de données « transcription » d'UN appel : le transport in-band du `bye` (raccrochage instantané),
 * du ping de keep-alive (toutes les 15 s tant que le canal est ouvert, comme iOS) et des entrées de
 * sous-titres. Il ne décode rien : les octets reçus sont remis tels quels à [onMessage], le routage
 * typé (`DataChannelCodec`) appartient à la couche applicative.
 */
public class CallDataChannel internal constructor(
    private val channel: DataChannel,
    private val scope: CoroutineScope,
    private val onMessage: (ByteArray) -> Unit,
    private val pingIntervalMillis: Long = PING_INTERVAL_MILLIS,
) {
    private var pingJob: Job? = null

    private val observer = object : DataChannel.Observer {
        override fun onBufferedAmountChange(previousAmount: Long) = Unit

        override fun onStateChange() {
            if (channel.state() == DataChannel.State.OPEN) startPing() else stopPing()
        }

        override fun onMessage(buffer: DataChannel.Buffer) {
            val bytes = ByteArray(buffer.data.remaining())
            buffer.data.get(bytes)
            onMessage(bytes)
        }
    }

    init {
        channel.registerObserver(observer)
        if (channel.state() == DataChannel.State.OPEN) startPing()
    }

    public val label: String get() = channel.label()

    public val isOpen: Boolean get() = channel.state() == DataChannel.State.OPEN

    /** Envoie une trame texte ; `false` si le canal n'est pas ouvert ou refuse l'envoi. */
    public fun send(bytes: ByteArray): Boolean {
        if (!isOpen) return false
        return runCatching { channel.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), false)) }.getOrDefault(false)
    }

    public fun close() {
        stopPing()
        runCatching { channel.unregisterObserver() }
        runCatching { channel.close() }
        runCatching { channel.dispose() }
    }

    @Synchronized
    private fun startPing() {
        stopPing()
        pingJob = scope.launch {
            while (true) {
                delay(pingIntervalMillis)
                send(DataChannelCodec.encodePing())
            }
        }
    }

    @Synchronized
    private fun stopPing() {
        pingJob?.cancel()
        pingJob = null
    }

    public companion object {
        public const val LABEL: String = "transcription"
        public const val PING_INTERVAL_MILLIS: Long = 15_000
    }
}
