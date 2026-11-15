package me.meeshy.app.share

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.IOException
import java.io.InputStream
import kotlin.coroutines.cancellation.CancellationException
import me.meeshy.sdk.media.displayNameOf
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.share.ShareFileName
import me.meeshy.sdk.model.share.ShareStagedMedia
import me.meeshy.sdk.model.share.ShareStagingBudget
import me.meeshy.sdk.model.share.ShareStagingError
import me.meeshy.sdk.model.share.ShareStagingPolicy
import me.meeshy.sdk.model.share.ShareStagingResult

/**
 * **La copie d'un fichier reçu d'une autre app vers le cache privé** — miroir de `ShareMediaStaging.stage` (extension
 * iOS). Quatre contraintes dictent sa forme :
 *
 * 1. la copie est EN FLUX, par tranches de [ShareStagingPolicy.COPY_BUFFER_BYTES] : jamais un tableau de la taille du
 *    fichier ;
 * 2. une pièce au-delà de [maxFileBytes] est refusée par son nom (elle ne partirait pas), et les octets se réservent dans
 *    [budget] (taille annoncée d'abord, puis ce que la lecture dépasse) : ce qui dépasse n'est pas copié, et l'écran le dit ;
 * 3. une copie qui échoue ne laisse RIEN : ni fichier partiel, ni réservation. L'espace libre se contrôle avant le
 *    premier octet, puis à chaque palier ([ShareStagingPolicy.nextSpaceCheck]) que le cumul atteint ;
 * 4. [ensureActive] est consulté à chaque tranche : un partage fermé en pleine copie arrête d'écrire, efface la copie
 *    partielle et laisse passer l'annulation.
 *
 * Le nom du fichier copié est [ShareStagingNames.fileName] (jamais le nom de l'expéditeur, #11134) ; le nom d'origine,
 * assaini, ne voyage qu'en métadonnée.
 */
class ShareMediaStaging(
    private val resolver: ContentResolver,
    private val directory: File,
    private val budget: ShareStagingBudget = ShareStagingBudget(),
    private val freeBytes: (File) -> Long = { it.usableSpace },
    private val maxFileBytes: Long = ShareStagingPolicy.MAX_FILE_BYTES,
    private val ensureActive: () -> Unit = {},
) {
    fun stage(uri: Uri, shareId: String, index: Int, declaredMime: String?): ShareStagingResult {
        ensureActive()
        val rawName = resolver.displayNameOf(uri) ?: uri.lastPathSegment
        val mime = MimeTypeResolver.resolve(runCatching { resolver.getType(uri) }.getOrNull() ?: declaredMime, rawName.orEmpty())
        val ext = ShareFileName.fileExtension(rawName.orEmpty().substringAfterLast('.', ""), mime)
        val name = ShareFileName.sanitizedOriginalName(listOf(rawName), ext)
        val tooLarge = ShareStagingError.TooLarge(name ?: "$index.$ext", maxFileBytes)
        val destination = File(directory, ShareStagingNames.fileName(shareId, index, ext))
        val failure = prepare(destination)
        if (failure != null) return ShareStagingResult.failure(index, failure)
        val announced = announcedSize(uri)
        if (announced > maxFileBytes) return ShareStagingResult.failure(index, tooLarge)
        ShareStagingPolicy.spaceRefusal(announced, freeBytes(directory))?.let { return ShareStagingResult.failure(index, it) }
        if (!budget.reserveFile(announced.coerceAtLeast(0L))) {
            return ShareStagingResult.failure(index, budget.refusalFor(announced.coerceAtLeast(0L)) ?: overBudget())
        }
        return when (val copied = copy(uri, destination, announced, tooLarge)) {
            is Copy.Failed -> {
                discard(destination, copied.reserved)
                ShareStagingResult.failure(index, copied.error)
            }
            is Copy.Cancelled -> {
                discard(destination, copied.reserved)
                throw copied.cause
            }
            is Copy.Done -> {
                budget.release(copied.reserved - copied.written)
                ShareStagingResult.success(index, ShareStagedMedia("${directory.name}/${destination.name}", ext, mime, copied.written, name))
            }
        }
    }

    private fun discard(destination: File, reserved: Long) {
        destination.delete()
        budget.release(reserved, file = true)
    }

    private fun prepare(destination: File): ShareStagingError? {
        if (!directory.isDirectory && !directory.mkdirs()) return ShareStagingError.CopyFailed("dossier du partage non créable")
        val inside = runCatching { destination.canonicalFile.parentFile == directory.canonicalFile }.getOrDefault(false)
        if (!inside) return ShareStagingError.DestinationOutsideShare
        if (destination.exists() && !destination.delete()) return ShareStagingError.CopyFailed("résidu non effaçable")
        return null
    }

    private fun announcedSize(uri: Uri): Long = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (column >= 0 && cursor.moveToFirst() && !cursor.isNull(column)) cursor.getLong(column) else UNKNOWN_SIZE
        }
    }.getOrNull() ?: UNKNOWN_SIZE

    private fun copy(uri: Uri, destination: File, announced: Long, tooLarge: ShareStagingError.TooLarge): Copy {
        var reserved = announced.coerceAtLeast(0L)
        var nextSpaceCheck = ShareStagingPolicy.nextSpaceCheck(0L)
        return try {
            val input = resolver.openInputStream(uri) ?: return Copy.Failed(ShareStagingError.CopyFailed("flux illisible"), reserved)
            val written = input.use { source ->
                destination.outputStream().use { sink ->
                    streamCopy(source, sink) { total ->
                        ensureActive()
                        if (total > maxFileBytes) throw StagingRefusal(tooLarge)
                        if (total > reserved) {
                            if (!budget.reserveMore(total - reserved)) throw StagingRefusal(budgetRefusal(total))
                            reserved = total
                        }
                        if (total >= nextSpaceCheck) {
                            ShareStagingPolicy.spaceRefusal(0L, freeBytes(directory))?.let { throw StagingRefusal(it) }
                            nextSpaceCheck = ShareStagingPolicy.nextSpaceCheck(total)
                        }
                    }
                }
            }
            if (written == 0L) Copy.Failed(ShareStagingError.CopyFailed("fichier vide"), reserved) else Copy.Done(written, reserved)
        } catch (refusal: StagingRefusal) {
            Copy.Failed(refusal.error, reserved)
        } catch (cancelled: CancellationException) {
            Copy.Cancelled(cancelled, reserved)
        } catch (failure: IOException) {
            Copy.Failed(ShareStagingError.CopyFailed(failure.message ?: "erreur d'entrée-sortie"), reserved)
        } catch (failure: RuntimeException) {
            Copy.Failed(ShareStagingError.CopyFailed(failure.javaClass.simpleName), reserved)
        }
    }

    private fun budgetRefusal(total: Long): ShareStagingError =
        ShareStagingError.ByteBudgetExceeded(budget.reservedBytes + total, budget.maxBytes)

    private fun overBudget(): ShareStagingError = ShareStagingError.ByteBudgetExceeded(budget.reservedBytes, budget.maxBytes)

    private class StagingRefusal(val error: ShareStagingError) : RuntimeException(null, null, false, false)

    private sealed interface Copy {
        data class Done(val written: Long, val reserved: Long) : Copy
        data class Failed(val error: ShareStagingError, val reserved: Long) : Copy
        data class Cancelled(val cause: CancellationException, val reserved: Long) : Copy
    }

    companion object {
        const val UNKNOWN_SIZE: Long = -1L

        /**
         * Copie [source] vers [sink] par tranches ; [admit] reçoit le total qu'atteindrait la tranche AVANT son écriture
         * et peut lever pour arrêter la copie. Rend les octets écrits.
         */
        fun streamCopy(source: InputStream, sink: java.io.OutputStream, admit: (total: Long) -> Unit): Long {
            val buffer = ByteArray(ShareStagingPolicy.COPY_BUFFER_BYTES)
            var written = 0L
            while (true) {
                val read = source.read(buffer, 0, buffer.size)
                if (read < 0) return written
                if (read == 0) continue
                admit(written + read)
                sink.write(buffer, 0, read)
                written += read
            }
        }
    }
}
