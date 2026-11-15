package me.meeshy.app.lottie

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.ui.component.lottie.PackFileReader
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * **Le réseau** d'un fichier de pack (#13952) : `GET <api>/pack-assets/<src>`, la route publique adressée par contenu
 * que sert la passerelle. Le corps est lu borné à la taille déclarée ; l'empreinte se vérifie en aval (magasin disque
 * et [me.meeshy.ui.component.lottie.LottieLayerSource]). Fail-soft : tout échec rend `null`, la couche s'efface.
 */
internal class HttpPackFileReader(
    private val client: OkHttpClient,
    private val apiBaseUrl: String,
) : PackFileReader {
    override suspend fun read(ref: PackAssetRef): ByteArray? {
        if (!mayFetch(ref)) return null
        return withContext(Dispatchers.IO) {
            runCatching {
                client.newCall(Request.Builder().url(url(apiBaseUrl, ref)).get().build()).execute().use { response ->
                    val body = response.body?.takeIf { response.isSuccessful } ?: return@use null
                    body.byteStream().use { stream -> stream.readAtMost(ref.bytes + 1) }
                        .takeIf { it.size.toLong() == ref.bytes }
                }
            }.getOrNull()
        }
    }

    companion object {
        /** Une couche d'apparence pèse quelques kilo-octets ; au-delà d'un mébioctet, on ne la télécharge pas. */
        const val MAX_BYTES: Long = 1_048_576

        fun mayFetch(ref: PackAssetRef): Boolean = ref.bytes in 1..MAX_BYTES

        fun url(apiBaseUrl: String, ref: PackAssetRef): String = "${apiBaseUrl.trimEnd('/')}/pack-assets/${ref.src}"

        /** Au plus [limit] octets du flux : un corps plus long que déclaré ne remplit jamais la mémoire. */
        fun InputStream.readAtMost(limit: Long): ByteArray {
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(8_192)
            while (out.size() < limit) {
                val read = read(buffer, 0, minOf(buffer.size.toLong(), limit - out.size()).toInt())
                if (read < 0) break
                out.write(buffer, 0, read)
            }
            return out.toByteArray()
        }
    }
}
