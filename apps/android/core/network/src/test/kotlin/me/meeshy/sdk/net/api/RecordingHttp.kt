package me.meeshy.sdk.net.api

import java.util.concurrent.CopyOnWriteArrayList
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import retrofit2.Retrofit

/**
 * Une requête telle qu'elle partirait sur le réseau, capturée au DERNIER maillon.
 *
 * Lire l'annotation `@GET` prouve ce qui est ÉCRIT, pas ce qui PART : le chemin de
 * base, les paramètres de requête, le corps sérialisé et l'en-tête de contenu se
 * décident dans Retrofit et dans le `Json` de [MeeshyApi]. Le corps est lu à la
 * capture, avant que la réponse ne ferme quoi que ce soit.
 */
internal class RecordedRequest(val request: Request) {
    val method: String get() = request.method
    val path: String get() = request.url.encodedPath
    val query: String? get() = request.url.encodedQuery
    val contentType: String? get() = request.body?.contentType()?.toString()
    val body: String? = request.body?.let { Buffer().also { buffer -> it.writeTo(buffer) }.readUtf8() }

    fun queryParameter(name: String): String? = request.url.queryParameter(name)

    fun hasQueryParameter(name: String): Boolean = name in request.url.queryParameterNames
}

/**
 * Un Retrofit réel, branché sur le décodeur réel de [MeeshyApi], dont le dernier
 * intercepteur court-circuite le réseau : il note la requête et rend [status] et
 * [responseBody] tels quels. Aucun serveur, aucun port — la requête n'a nulle part
 * où aller, et la réponse remonte toute la chaîne de conversion.
 *
 * [outer], quand il est donné, s'intercale AVANT le capteur : une couche de
 * réessai qui y vit rejoue la requête, et chaque tentative est notée.
 */
internal class RecordingHttp(
    private val status: Int = 200,
    private val responseBody: String = """{"success":true,"data":{}}""",
    private val outer: Interceptor? = null,
) {
    val requests = CopyOnWriteArrayList<RecordedRequest>()

    val only: RecordedRequest get() = requests.single()

    fun <T> serve(service: Class<T>): T {
        val client = OkHttpClient.Builder()
            .retryOnConnectionFailure(false)
            .apply { outer?.let { addInterceptor(it) } }
            .addInterceptor { chain ->
                val request = chain.request()
                requests += RecordedRequest(request)
                Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(status)
                    .message("recorded")
                    .body(responseBody.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(service)
    }

    companion object {
        const val BASE_URL = "https://gate.staging.meeshy.me/api/v1/"
    }
}
