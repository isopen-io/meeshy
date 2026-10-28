package me.meeshy.sdk.media.scene

import java.io.File
import java.io.IOException
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/** Une adresse que le bake refuse AVANT tout appel réseau, ou un fichier qui dépasse la taille admise. */
public class SceneAssetRefusedException(reason: String) : IOException(reason)

/**
 * Ramène en local le fond vidéo ou le son d'une scène avant son bake. Annulable (l'appel réseau est coupé, la copie
 * s'arrête), et un transfert qui échoue, s'interrompt ou dépasse [maxBytes] ne laisse JAMAIS de fichier partiel.
 *
 * Le [client] est NU : aucun intercepteur d'identité n'y est monté, donc rien ne part vers une adresse que l'auteur
 * d'une scène aurait écrite. [admits] refuse avant envoi toute adresse hors de la politique média (https, aucune adresse
 * privée), et [headers] ne pose l'identité du compte que sur la route protégée des sons de la bibliothèque
 * (`<api>/static/<fichier>`, `MediaRequestCredential`).
 */
public class SceneAssetFetcher(
    private val client: OkHttpClient,
    private val admits: (String) -> Boolean,
    private val headers: (String) -> Map<String, String> = { emptyMap() },
    private val maxBytes: Long = DEFAULT_MAX_BYTES,
) {

    public suspend fun fetch(url: String, target: File) {
        if (!admits(url)) throw SceneAssetRefusedException("adresse refusee")
        try {
            val request = Request.Builder().url(url).apply { headers(url).forEach { (name, value) -> header(name, value) } }.build()
            execute(request).use { served ->
                if (!served.isSuccessful) throw IOException("statut ${served.code}")
                val body = served.body ?: throw IOException("corps vide")
                if (body.contentLength() > maxBytes) throw SceneAssetRefusedException("fichier trop lourd")
                withContext(Dispatchers.IO) { copyBounded(body.byteStream(), target) }
            }
        } catch (failure: Throwable) {
            withContext(NonCancellable) { target.delete() }
            throw failure
        }
    }

    private suspend fun copyBounded(input: java.io.InputStream, target: File) {
        target.parentFile?.mkdirs()
        target.outputStream().use { out ->
            val buffer = ByteArray(BUFFER_BYTES)
            var total = 0L
            while (true) {
                currentCoroutineContext().ensureActive()
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > maxBytes) throw SceneAssetRefusedException("fichier trop lourd")
                out.write(buffer, 0, read)
            }
        }
    }

    private suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(
            object : Callback {
                override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)

                override fun onResponse(call: Call, response: Response) {
                    continuation.resume(response) { _, served, _ -> served.close() }
                }
            },
        )
    }

    public companion object {
        /** Un fond de story dure au plus une minute : 200 Mo couvrent la vidéo la plus lourde qu'une slide accepte. */
        public const val DEFAULT_MAX_BYTES: Long = 200L * 1024 * 1024
        private const val BUFFER_BYTES = 64 * 1024
    }
}
