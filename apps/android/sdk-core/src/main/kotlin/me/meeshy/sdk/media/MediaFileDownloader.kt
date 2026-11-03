package me.meeshy.sdk.media

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.mediacache.MediaCacheDirective
import me.meeshy.sdk.model.mediacache.TransferProgressCadence
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Un fichier de transit complet, avec ce que le serveur permet d'en faire. */
class StagedDownload(val file: File, val directive: MediaCacheDirective, val bytes: Long)

/** Le serveur dit que le média n'existe plus (404/410) : rappelé, expiré ou consommé — inutile de réessayer. */
class MediaGoneException(val statusCode: Int) : IOException("Media gone ($statusCode)")

/** Réponse non réussie du serveur (hors 404/410). */
class MediaHttpException(val statusCode: Int) : IOException("Media request failed ($statusCode)")

/**
 * **Télécharge une ressource vers un FICHIER, jamais vers un tableau d'octets** (miroir de `MediaFileDownloader`,
 * iOS). Le corps de la réponse est copié par tampons de 64 Ko dans un fichier de [stagingDir] : une vidéo de 200 Mo ne
 * transite jamais par la mémoire. L'appelant est propriétaire du fichier rendu (il le déplace dans le cache ou le
 * supprime) ; en échec ou en annulation, rien ne reste. La progression est cadencée ([TransferProgressCadence] :
 * premier et dernier rapport, intervalle minimal) pour ne pas recomposer toutes les surfaces.
 *
 * Brique opaque : ni cache, ni clé, ni profil. Le client OkHttp reçu est celui des médias, qui ne porte l'identité que
 * vers l'origine de l'API.
 */
class MediaFileDownloader(
    private val client: Call.Factory,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun download(
        url: String,
        stagingDir: File,
        expectedBytes: Long,
        onProgress: (written: Long, expected: Long) -> Unit,
    ): StagedDownload {
        val request = Request.Builder().url(url).get().build()
        val call = client.newCall(request)
        val response = call.await()
        try {
            return withContext(io) { stream(response, stagingDir, expectedBytes, onProgress) }
        } finally {
            response.close()
        }
    }

    private suspend fun stream(
        response: Response,
        stagingDir: File,
        expectedBytes: Long,
        onProgress: (Long, Long) -> Unit,
    ): StagedDownload {
        if (MediaCacheDirective.meansGone(response.code)) throw MediaGoneException(response.code)
        if (!response.isSuccessful) throw MediaHttpException(response.code)
        val body = response.body ?: throw IOException("Empty media body")
        val declared = body.contentLength()
        val expected = if (declared > 0) declared else expectedBytes
        stagingDir.mkdirs()
        val staged = File(stagingDir, UUID.randomUUID().toString())
        val cadence = TransferProgressCadence()
        var written = 0L
        try {
            val context = currentCoroutineContext()
            staged.outputStream().buffered(BUFFER_BYTES).use { out ->
                val source = body.source()
                val buffer = ByteArray(BUFFER_BYTES)
                while (true) {
                    context.ensureActive()
                    val read = source.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    written += read
                    if (cadence.admits(written, expected, clock())) onProgress(written, expected)
                }
            }
            if (written == 0L || (declared > 0 && written != declared)) throw IOException("Truncated media ($written/$declared)")
            onProgress(written, if (expected > 0) expected else written)
        } catch (failure: Throwable) {
            staged.delete()
            throw failure
        }
        return StagedDownload(staged, MediaCacheDirective.fromCacheControl(response.header("Cache-Control")), written)
    }

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                if (continuation.isActive) continuation.resume(response) else response.close()
            }
        })
    }

    private companion object {
        const val BUFFER_BYTES = 64 * 1024
    }
}
