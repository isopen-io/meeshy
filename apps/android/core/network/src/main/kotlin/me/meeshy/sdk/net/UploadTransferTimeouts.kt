package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * Les délais d'un bloc tus (#13959). Une requête JSON attend sa réponse 10 s (le défaut d'OkHttp) ; un bloc tus non : la
 * passerelle écrit le bloc reçu, puis, au DERNIER, nettoie les métadonnées, extrait les dimensions et rend vignette et
 * variantes AVANT de répondre (`onUploadFinish`, `services/gateway/src/routes/uploads/tus-handler.ts`). Une photo de 2,85 Mo
 * dépassait ainsi les 10 s et l'envoi échouait alors que tous ses octets étaient arrivés. L'attente croît avec le bloc et
 * reste bornée ; l'écriture tolère un réseau lent sans couper un envoi qui avance.
 */
object UploadTransferTimeouts {
    /** Le type d'un corps de PATCH tus — le seul que ces délais concernent. */
    const val MEDIA_TYPE: String = "application/offset+octet-stream"

    const val WRITE_MILLIS: Long = 60_000L
    const val BASE_READ_MILLIS: Long = 60_000L
    const val READ_MILLIS_PER_MIB: Long = 15_000L
    const val MAX_READ_MILLIS: Long = 600_000L

    private const val MIB: Long = 1024L * 1024L

    /** L'attente de la réponse d'un bloc de [bodyBytes] octets. */
    fun readMillis(bodyBytes: Long): Long {
        val bytes = bodyBytes.coerceAtLeast(0L)
        val mebibytes = bytes / MIB + if (bytes % MIB > 0L) 1L else 0L
        return BASE_READ_MILLIS + mebibytes.coerceAtMost((MAX_READ_MILLIS - BASE_READ_MILLIS) / READ_MILLIS_PER_MIB) * READ_MILLIS_PER_MIB
    }
}

/** Pose [UploadTransferTimeouts] sur chaque PATCH tus, et sur lui seul : le reste du trafic garde ses délais. */
class UploadTransferTimeoutInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val body = request.body ?: return chain.proceed(request)
        val type = body.contentType() ?: return chain.proceed(request)
        if ("${type.type}/${type.subtype}" != UploadTransferTimeouts.MEDIA_TYPE) return chain.proceed(request)
        return chain
            .withWriteTimeout(UploadTransferTimeouts.WRITE_MILLIS.toInt(), TimeUnit.MILLISECONDS)
            .withReadTimeout(UploadTransferTimeouts.readMillis(body.contentLength()).toInt(), TimeUnit.MILLISECONDS)
            .proceed(request)
    }
}
