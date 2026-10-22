package me.meeshy.sdk.net.api

import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import retrofit2.Retrofit

/**
 * Une route est mesuree a son DERNIER maillon avant le reseau : la requete est
 * capturee telle qu'elle partirait (verbe, chemin complet, corps JSON, en-tetes) et la
 * reponse remonte toute la chaine de conversion reelle (`MeeshyApi.json`, meme
 * reglage qu'en production). Lire l'annotation `@POST` prouverait ce qui est ECRIT,
 * pas ce qui PART : le corps, lui, vit dans le convertisseur.
 *
 * Aucun serveur factice : la bibliotheque `mockwebserver` n'est pas au catalogue du
 * module, et ce montage dit la meme chose sans port ouvert.
 */
internal class RouteProbe(private val reply: String = """{"success":true}""") {

    class Call(private val request: Request) {
        val method: String get() = request.method
        val path: String get() = request.url.encodedPath
        val query: String? get() = request.url.encodedQuery
        fun header(name: String): String? = request.header(name)

        /** Le corps tel qu'il part, ou `null` quand la requete n'en porte pas. */
        val body: String?
            get() = request.body?.let { body -> Buffer().also { buffer -> body.writeTo(buffer) }.readUtf8() }
    }

    private var captured: Call? = null

    /** La derniere requete emise ; echoue FORT s'il n'y en a pas (une sonde muette ne prouve rien). */
    val call: Call get() = checkNotNull(captured) { "aucune requete n'est partie" }

    fun <T> api(type: Class<T>): T {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                captured = Call(chain.request())
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(reply.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .build()
            .create(type)
    }

    companion object {
        const val BASE_URL: String = "https://gate.staging.meeshy.me/api/v1/"
    }
}
