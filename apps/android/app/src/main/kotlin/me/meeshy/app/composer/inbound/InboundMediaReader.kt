package me.meeshy.app.composer.inbound

import me.meeshy.sdk.model.composer.InboundMediaKind
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import me.meeshy.sdk.model.composer.InboundMediaRefusal
import me.meeshy.sdk.model.composer.InboundMediaVerdict
import java.io.InputStream

/** Un média reçu, LU et jugé : ses octets, et le type que ses octets disent — jamais le nom ni le type de l'expéditeur. */
class InboundMedia(val bytes: ByteArray, val kind: InboundMediaKind, val mimeType: String, val extension: String)

sealed interface InboundRead {
    data class Read(val media: InboundMedia) : InboundRead
    data class Refused(val reason: InboundMediaRefusal) : InboundRead
}

/**
 * Lit un flux reçu d'une autre app sans lui faire confiance : jamais plus de [InboundMediaPolicy.MAX_BYTES] + 1 octets
 * en mémoire (un flux sans fin, ou qui ment sur sa taille, s'arrête là), puis verdict de la politique sur les octets LUS.
 */
internal object InboundMediaReader {
    fun read(open: () -> InputStream?, declaredMime: String?): InboundRead {
        val bytes = runCatching { open()?.use(::readBounded) }.getOrNull()
            ?: return InboundRead.Refused(InboundMediaRefusal.EMPTY)
        return when (val verdict = InboundMediaPolicy.judge(bytes.copyOf(minOf(bytes.size, InboundMediaPolicy.HEADER_BYTES)), bytes.size.toLong(), declaredMime)) {
            is InboundMediaVerdict.Admitted -> InboundRead.Read(InboundMedia(bytes, verdict.kind, verdict.mimeType, verdict.extension))
            is InboundMediaVerdict.Refused -> InboundRead.Refused(verdict.reason)
        }
    }

    private fun readBounded(stream: InputStream): ByteArray {
        val limit = InboundMediaPolicy.MAX_BYTES + 1
        val out = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK)
        var total = 0L
        while (total < limit) {
            val read = stream.read(chunk, 0, minOf(CHUNK.toLong(), limit - total).toInt())
            if (read < 0) break
            out.write(chunk, 0, read)
            total += read
        }
        return out.toByteArray()
    }

    private const val CHUNK = 64 * 1024
}
