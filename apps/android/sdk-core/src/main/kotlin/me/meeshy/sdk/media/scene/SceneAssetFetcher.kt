package me.meeshy.sdk.media.scene

import java.io.File
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/**
 * Ramène en local le fond vidéo ou le son d'une scène avant son bake. Annulable (l'appel réseau est coupé), et un
 * transfert qui échoue ou s'interrompt ne laisse JAMAIS de fichier partiel.
 */
public class SceneAssetFetcher(private val client: OkHttpClient) {

    public suspend fun fetch(url: String, target: File) {
        try {
            val response = execute(Request.Builder().url(url).build())
            response.use { served ->
                if (!served.isSuccessful) throw IOException("statut ${served.code}")
                val body = served.body ?: throw IOException("corps vide")
                withContext(Dispatchers.IO) {
                    target.parentFile?.mkdirs()
                    target.outputStream().use { out -> body.byteStream().copyTo(out) }
                }
            }
        } catch (failure: Throwable) {
            withContext(kotlinx.coroutines.NonCancellable) { target.delete() }
            throw failure
        }
    }

    private suspend fun execute(request: Request): Response = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(
            object : Callback {
                override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)

                override fun onResponse(call: Call, response: Response) = continuation.resume(response)
            },
        )
    }
}
