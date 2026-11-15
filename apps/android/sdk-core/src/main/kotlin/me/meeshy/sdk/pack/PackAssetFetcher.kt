package me.meeshy.sdk.pack

import java.io.IOException
import javax.inject.Inject
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.sdk.net.api.PackAssetsApi
import retrofit2.HttpException

/** Ce qui va chercher un fichier de pack sur le réseau. */
interface PackAssetFetching {
    /** Les octets de [ref], au plus `ref.bytes + 1` : un corps plus long que déclaré est refusé par l'empreinte, jamais gardé. */
    suspend fun fetch(ref: PackAssetRef): ByteArray
}

/** Pourquoi un fichier de pack n'est pas venu. */
sealed class PackAssetFetchException(message: String, cause: Throwable? = null) : IOException(message, cause) {
    /** 404 : la passerelle ne connaît pas ce fichier (le pack a changé de version). */
    class NotFound(file: String) : PackAssetFetchException("fichier de pack introuvable : $file")

    /** Une réponse HTTP autre que 200. */
    class Http(file: String, val code: Int) : PackAssetFetchException("fichier de pack refusé ($code) : $file")

    /** Coupure, délai, plus de place : la reprise est affaire de la file. */
    class Network(file: String, cause: Throwable) : PackAssetFetchException("fichier de pack interrompu : $file", cause)
}

/** `GET /api/v1/pack-assets/<fichier>` : public, sans jeton, immuable. */
class PackAssetHttpFetcher @Inject constructor(
    private val api: PackAssetsApi,
) : PackAssetFetching {
    override suspend fun fetch(ref: PackAssetRef): ByteArray =
        try {
            api.file(ref.src).use { body -> body.byteStream().use { it.readAtMost(ref.bytes + 1) } }
        } catch (error: HttpException) {
            throw if (error.code() == 404) PackAssetFetchException.NotFound(ref.src) else PackAssetFetchException.Http(ref.src, error.code())
        } catch (error: PackAssetFetchException) {
            throw error
        } catch (error: IOException) {
            throw PackAssetFetchException.Network(ref.src, error)
        }

    private fun java.io.InputStream.readAtMost(limit: Long): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        while (out.size() < limit) {
            val read = read(buffer, 0, minOf(buffer.size.toLong(), limit - out.size()).toInt())
            if (read < 0) break
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }

    private companion object {
        const val BUFFER = 8_192
    }
}
