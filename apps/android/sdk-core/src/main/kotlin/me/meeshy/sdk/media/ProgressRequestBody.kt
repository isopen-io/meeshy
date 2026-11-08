package me.meeshy.sdk.media

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import okio.ForwardingSink
import okio.Sink
import okio.buffer

/**
 * Un corps de requête qui dit où en sont ses octets (#16133) : la pièce d'un message part en multipart, sans protocole
 * de reprise, donc sans autre témoin de sa progression que le flux lui-même. [onProgress] reçoit `(envoyés, total)` AU
 * PLUS une fois par pourcent entier : un fichier de 80 Mo écrit par tronçons de 8 Ko ne déclenche jamais dix mille
 * publications. Une taille inconnue ne publie rien. Un corps rejoué (nouvelle tentative de la couche réseau) repart de zéro.
 */
internal class ProgressRequestBody(
    private val delegate: RequestBody,
    private val onProgress: (sent: Long, total: Long) -> Unit,
) : RequestBody() {

    override fun contentType(): MediaType? = delegate.contentType()

    override fun contentLength(): Long = delegate.contentLength()

    override fun isOneShot(): Boolean = delegate.isOneShot()

    override fun writeTo(sink: BufferedSink) {
        val total = contentLength()
        if (total <= 0L) {
            delegate.writeTo(sink)
            return
        }
        val counting = CountingSink(sink, total, onProgress).buffer()
        delegate.writeTo(counting)
        counting.flush()
    }

    private class CountingSink(
        delegate: Sink,
        private val total: Long,
        private val onProgress: (Long, Long) -> Unit,
    ) : ForwardingSink(delegate) {
        private var sent = 0L
        private var lastPercent = 0L

        override fun write(source: okio.Buffer, byteCount: Long) {
            super.write(source, byteCount)
            sent += byteCount
            val percent = (sent.coerceAtMost(total) * 100 / total)
            if (percent > lastPercent) {
                lastPercent = percent
                onProgress(sent.coerceAtMost(total), total)
            }
        }
    }
}
