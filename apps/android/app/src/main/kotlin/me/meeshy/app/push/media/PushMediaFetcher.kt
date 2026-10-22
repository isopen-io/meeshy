package me.meeshy.app.push.media

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.push.PushAttachmentPolicy
import me.meeshy.sdk.model.push.PushTrustedOrigin
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Télécharge le média d'une notification (image ou vocal) — miroir de l'étage réseau de
 * la NSE iOS. Quatre garanties :
 *  - l'URL est vérifiée par [PushTrustedOrigin] AVANT toute requête (un hôte voisin ne
 *    coûte aucun appel) et la politique de [PushAttachmentPolicy] décide du pré-vol ;
 *  - le corps est écrit sur DISQUE par flux borné, jamais en mémoire, puis sa taille
 *    MESURÉE est revérifiée ;
 *  - le tout est annulable et borné par le budget : à l'échéance l'appel réseau est
 *    coupé et le fichier temporaire supprimé ;
 *  - l'échec est silencieux : `null`, la bannière texte part seule.
 *
 * Le client porte les en-têtes d'identité de l'app (fournis par son module Hilt).
 */
class PushMediaFetcher(
    private val client: OkHttpClient,
    private val cacheDir: File,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {

    suspend fun fetch(
        url: String,
        mimeType: String,
        declaredSize: Long?,
        data: Map<String, Any?>,
        budgetMillis: Long,
    ): File? {
        if (!PushAttachmentPolicy.shouldFetch(data, mimeType, declaredSize)) return null
        if (!PushTrustedOrigin.isTrustedMediaUrl(url)) return null
        if (budgetMillis <= 0) return null
        val target = File(cacheDir, "push-media-${UUID.randomUUID()}")
        val kept = try {
            withTimeoutOrNull(budgetMillis) { withContext(ioDispatcher) { download(url, target) } } ?: false
        } catch (e: CancellationException) {
            target.delete()
            throw e
        } catch (e: Exception) {
            false
        }
        if (!kept) target.delete()
        return target.takeIf { kept }
    }

    private suspend fun download(url: String, target: File): Boolean {
        val request = runCatching { Request.Builder().url(url).get().build() }.getOrNull() ?: return false
        val call = client.newCall(request)
        val job: Job = currentCoroutineContext()[Job] ?: return false
        val registration = job.invokeOnCompletion(onCancelling = true) { call.cancel() }
        try {
            call.execute().use { response ->
                if (!response.isSuccessful) return false
                if (!PushTrustedOrigin.isTrustedMediaUrl(response.request.url.toString())) return false
                val announced = response.header("Content-Length")?.toLongOrNull()
                if (announced != null && !PushAttachmentPolicy.mayAttach("image/*", announced)) return false
                val body = response.body ?: return false
                val written = copyBounded(body.byteStream(), target)
                return written != null && PushAttachmentPolicy.mayKeepDownloaded(target.length())
            }
        } catch (e: IOException) {
            return false
        } finally {
            registration.dispose()
        }
    }

    private fun copyBounded(input: java.io.InputStream, target: File): Long? {
        var total = 0L
        input.use { source ->
            target.outputStream().use { sink ->
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > PushAttachmentPolicy.MAX_ATTACHMENT_BYTES) return null
                    sink.write(buffer, 0, read)
                }
            }
        }
        return total
    }

    private companion object {
        const val BUFFER_SIZE = 16 * 1024
    }
}
