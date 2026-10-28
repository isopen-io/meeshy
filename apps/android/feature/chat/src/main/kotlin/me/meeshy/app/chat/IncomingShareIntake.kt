package me.meeshy.app.chat

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat
import java.io.FilterInputStream
import java.io.InputStream
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.media.displayNameOf
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import me.meeshy.sdk.model.share.ShareLimits

/**
 * Ce que « Partager vers Meeshy » LIT d'un intent (#13585) : seulement les flux d'`EXTRA_STREAM` (jamais une URI de
 * `ClipData` ni du texte), au plus [ShareLimits.MAX_FILES], chacun jugé par [admits] — `InboundMediaPolicy.admitsSource`
 * dans l'activité. Ce qui est refusé et ce qui dépasse le plafond est COMPTÉ, pour être dit ([IncomingShortfall]).
 */
data class IncomingShareSelection(val admitted: List<Uri>, val refused: Int, val overflow: Int) {
    companion object {
        fun of(intent: Intent, admits: (Uri) -> Boolean): IncomingShareSelection {
            val streams = streamsOf(intent)
            val (admitted, refused) = streams.take(ShareLimits.MAX_FILES).partition(admits)
            return IncomingShareSelection(admitted, refused.size, (streams.size - ShareLimits.MAX_FILES).coerceAtLeast(0))
        }

        private fun streamsOf(intent: Intent): List<Uri> = runCatching {
            if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty().filterNotNull()
            } else {
                listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            }
        }.getOrDefault(emptyList())
    }
}

/** Le sort d'une pièce reçue : copiée dans le cache privé, trop lourde pour partir (son nom est dit), ou illisible. */
internal sealed interface IncomingRead {
    data class Copied(val item: MediaUploadItem) : IncomingRead
    data class TooLarge(val fileName: String) : IncomingRead
    data object Unreadable : IncomingRead
}

/** Ce que le partage laisse derrière lui, une raison par sorte, jamais une par fichier — miroir de `ShareShortfall` (iOS). */
internal sealed interface IncomingShortfall {
    data object RefusedSource : IncomingShortfall
    data class OverBudget(val uncopied: Int) : IncomingShortfall
    data class TooLarge(val fileNames: List<String>) : IncomingShortfall
    data object Unprepared : IncomingShortfall

    companion object {
        fun of(reads: List<IncomingRead>, selection: IncomingShareSelection): List<IncomingShortfall> {
            val tooLarge = reads.filterIsInstance<IncomingRead.TooLarge>().map { it.fileName }
            return listOfNotNull(
                RefusedSource.takeIf { selection.refused > 0 },
                OverBudget(selection.overflow).takeIf { selection.overflow > 0 },
                TooLarge(tooLarge).takeIf { tooLarge.isNotEmpty() },
                Unprepared.takeIf { reads.any { it == IncomingRead.Unreadable } },
            )
        }
    }
}

/**
 * Le nom d'ORIGINE d'un fichier reçu, tel qu'il peut voyager — miroir de `ShareMediaStaging.sanitizedOriginalName` (iOS) :
 * son dernier composant, sans caractère de contrôle ni de mise en forme bidirectionnelle (`photo‮gpj.exe` se lirait
 * `photoexe.jpg`), `:` remplacé, sans point ni espace en tête, plafonné à [MAX_BYTES] octets UTF-8 en gardant son extension.
 */
internal object IncomingFileName {
    const val MAX_BYTES: Int = 120

    fun sanitized(raw: String?, mimeType: String): String? {
        val last = raw?.split('/', '\\')?.lastOrNull { it.isNotEmpty() } ?: return null
        val cleaned = buildString { last.codePoints().filter { !isInvisibleOrControl(it) }.forEach { appendCodePoint(if (it == ':'.code) '_'.code else it) } }
        val name = cleaned.trim().trimStart('.', ' ').trim()
        if (name.isEmpty() || name == "." || name == "..") return null
        val dot = name.lastIndexOf('.')
        val nameExt = if (dot > 0) name.substring(dot + 1) else ""
        val hasSafeExt = isSafeExtension(nameExt.lowercase())
        val stem = if (hasSafeExt) name.substring(0, dot) else name
        val ext = if (hasSafeExt) nameExt else MimeTypeResolver.preferredExtensionForMime(mimeType)?.takeIf(::isSafeExtension) ?: "bin"
        val suffix = ".$ext"
        val cappedStem = truncated(stem, MAX_BYTES - suffix.toByteArray(Charsets.UTF_8).size).trim().trim('.').trim()
        return cappedStem.takeIf { it.isNotEmpty() }?.plus(suffix)
    }

    private fun isInvisibleOrControl(codePoint: Int): Boolean =
        codePoint in 0x00..0x1F || codePoint in 0x7F..0x9F || codePoint in 0x200B..0x200F ||
            codePoint in 0x202A..0x202E || codePoint in 0x2060..0x2069 || codePoint == 0xFEFF

    private fun isSafeExtension(ext: String): Boolean = ext.length in 1..10 && ext.all { it in 'a'..'z' || it in '0'..'9' }

    private fun truncated(text: String, limit: Int): String {
        if (limit <= 0) return ""
        val kept = StringBuilder()
        var bytes = 0
        text.codePoints().toArray().forEach { codePoint ->
            bytes += String(Character.toChars(codePoint)).toByteArray(Charsets.UTF_8).size
            if (bytes > limit) return kept.toString()
            kept.appendCodePoint(codePoint)
        }
        return kept.toString()
    }
}

/**
 * Copie EN FLUX une pièce reçue d'une autre app dans le cache privé ([MediaIntake]), bornée au plafond d'envoi
 * ([ComposerAttachmentLimits.MAX_UPLOAD_BYTES]) : la copie s'arrête au premier octet de trop et ne laisse rien. Le type
 * vient du fournisseur ou de [declaredMime] (un joker ne compte pas), sinon du nom ; le nom annoncé est nettoyé.
 * Un fournisseur qui lève une exception n'est qu'une pièce illisible.
 */
internal fun readIncomingAttachment(context: Context, uri: Uri, declaredMime: String? = null): IncomingRead {
    val resolver = context.contentResolver
    val rawName = resolver.displayNameOf(uri) ?: uri.lastPathSegment
    val mimeType = MimeTypeResolver.resolve(runCatching { resolver.getType(uri) }.getOrNull() ?: declaredMime, rawName.orEmpty())
    val fileName = IncomingFileName.sanitized(rawName, mimeType) ?: "attachment.${MimeTypeResolver.preferredExtensionForMime(mimeType) ?: "bin"}"
    val max = ComposerAttachmentLimits.MAX_UPLOAD_BYTES
    var counted = 0L
    val item = runCatching {
        resolver.openInputStream(uri)?.let { CountingInputStream(it) { n -> counted += n } }?.use { MediaIntake.copy(it, context.cacheDir, fileName, mimeType, max) }
    }.getOrNull()
    val file = (item?.source as? MediaUploadSource.OnDisk)?.file
    return when {
        item != null && file != null && file.length() > 0L -> IncomingRead.Copied(item)
        file != null -> IncomingRead.Unreadable.also { file.delete() }
        counted > max -> IncomingRead.TooLarge(fileName)
        else -> IncomingRead.Unreadable
    }
}

private class CountingInputStream(input: InputStream, private val onRead: (Int) -> Unit) : FilterInputStream(input) {
    override fun read(): Int = super.read().also { if (it >= 0) onRead(1) }
    override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) onRead(it) }
}
