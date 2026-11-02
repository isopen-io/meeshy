package me.meeshy.app.composer.inbound

import me.meeshy.sdk.model.composer.InboundMediaKind
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import me.meeshy.sdk.model.composer.InboundMediaRefusal
import me.meeshy.sdk.model.composer.InboundMediaVerdict
import java.io.File
import java.io.InputStream

/** Ce qu'une source dit offrir : comment l'ouvrir (à chaque appel, un flux neuf) et le type que son expéditeur déclare — un indice, pas une preuve. */
class InboundSource(val open: () -> InputStream?, val declaredMime: String? = null)

/** Un média reçu, jugé et COPIÉ : son type est celui de ses octets, jamais celui de l'expéditeur. */
data class InboundStored(val kind: InboundMediaKind, val mimeType: String, val extension: String, val bytes: Long)

sealed interface InboundCopy {
    data class Stored(val media: InboundStored) : InboundCopy
    data class Refused(val reason: InboundMediaRefusal) : InboundCopy
}

/**
 * Copie un flux reçu d'une autre app vers un fichier privé sans lui faire confiance, et SANS le tenir en mémoire : un
 * tampon de 64 Kio, le type jugé sur les premiers octets AVANT d'écrire le reste, et un arrêt à [InboundMediaPolicy.MAX_BYTES]
 * + 1 octet (un flux sans fin, ou qui ment sur sa taille, s'arrête là). Un refus ne laisse aucun fichier.
 */
internal object InboundMediaReader {
    fun copy(source: InboundSource, target: File): InboundCopy {
        val result = runCatching {
            source.open()?.use { stream -> copyJudged(stream, source.declaredMime, target) }
        }.getOrNull() ?: InboundCopy.Refused(InboundMediaRefusal.EMPTY)
        if (result is InboundCopy.Refused) target.delete()
        return result
    }

    private fun copyJudged(stream: InputStream, declaredMime: String?, target: File): InboundCopy {
        val chunk = ByteArray(CHUNK)
        val first = fill(stream, chunk, InboundMediaPolicy.HEADER_BYTES)
        val header = chunk.copyOf(first)
        val verdict = InboundMediaPolicy.judge(header, first.toLong(), declaredMime)
        val admitted = verdict as? InboundMediaVerdict.Admitted
            ?: return InboundCopy.Refused((verdict as InboundMediaVerdict.Refused).reason)
        var total = first.toLong()
        target.outputStream().use { out ->
            out.write(chunk, 0, first)
            var read = stream.read(chunk, 0, chunkLimit(total))
            while (read >= 0 && total <= InboundMediaPolicy.MAX_BYTES) {
                out.write(chunk, 0, read)
                total += read
                read = if (total > InboundMediaPolicy.MAX_BYTES) -1 else stream.read(chunk, 0, chunkLimit(total))
            }
        }
        if (total > InboundMediaPolicy.MAX_BYTES) return InboundCopy.Refused(InboundMediaRefusal.TOO_LARGE)
        return InboundCopy.Stored(InboundStored(admitted.kind, admitted.mimeType, admitted.extension, total))
    }

    private fun chunkLimit(total: Long): Int = minOf(CHUNK.toLong(), InboundMediaPolicy.MAX_BYTES + 1 - total).toInt().coerceAtLeast(1)

    private fun fill(stream: InputStream, into: ByteArray, wanted: Int): Int {
        var filled = 0
        while (filled < wanted) {
            val read = stream.read(into, filled, wanted - filled)
            if (read < 0) break
            filled += read
        }
        return filled
    }

    private const val CHUNK = 64 * 1024
}
