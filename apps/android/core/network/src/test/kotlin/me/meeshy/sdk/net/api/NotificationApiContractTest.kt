package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.lang.reflect.Method
import me.meeshy.sdk.model.ReadNotificationsByTypesRequest
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.UnregisterDeviceTokenRequest
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HEAD
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Le contrat Retrofit des routes de notifications, lu sur les ANNOTATIONS : le
 * verbe, le chemin et la présence d'un corps de chaque méthode ajoutée ou corrigée.
 *
 * Ce que ce témoin attrape que `NotificationApiRoutesTest` ne dit pas : une
 * déclaration que Retrofit REFUSE. `@DELETE` + `@Body` ne compile pas en erreur —
 * il lève « Non-body HTTP method cannot contain @Body » au premier appel, c'est-à-dire
 * en production, sur un appareil. `no bodiless verb carries a Body parameter in any Api interface`
 * ferme cette classe entière de défauts, pour toutes les interfaces du module.
 */
class NotificationApiContractTest {

    private data class Wire(val verb: String, val path: String, val hasBody: Boolean)

    private fun method(type: Class<*>, name: String): Method =
        type.declaredMethods.single { it.name == name }

    private fun bodyParameters(method: Method): List<Int> =
        method.parameterAnnotations.withIndex()
            .filter { (_, annotations) -> annotations.any { it is Body } }
            .map { it.index }

    /** Le verbe, le chemin et la présence d'un corps tels que Retrofit les lira sur [method]. */
    private fun wireOf(method: Method): Wire {
        method.getAnnotation(HTTP::class.java)?.let { return Wire(it.method, it.path, it.hasBody) }
        val hasBody = bodyParameters(method).isNotEmpty()
        method.getAnnotation(GET::class.java)?.let { return Wire("GET", it.value, false) }
        method.getAnnotation(HEAD::class.java)?.let { return Wire("HEAD", it.value, false) }
        method.getAnnotation(DELETE::class.java)?.let { return Wire("DELETE", it.value, false) }
        method.getAnnotation(POST::class.java)?.let { return Wire("POST", it.value, hasBody) }
        method.getAnnotation(PUT::class.java)?.let { return Wire("PUT", it.value, hasBody) }
        method.getAnnotation(PATCH::class.java)?.let { return Wire("PATCH", it.value, hasBody) }
        error("${method.name} ne porte aucune annotation de verbe")
    }

    /** Vrai quand le verbe déclaré n'admet pas de corps pour Retrofit : GET, HEAD, DELETE, ou `HTTP` sans `hasBody`. */
    private fun forbidsBody(method: Method): Boolean =
        method.isAnnotationPresent(GET::class.java) ||
            method.isAnnotationPresent(HEAD::class.java) ||
            method.isAnnotationPresent(DELETE::class.java) ||
            method.getAnnotation(HTTP::class.java)?.let { !it.hasBody } == true

    private fun queryNames(method: Method): List<String> =
        method.parameterAnnotations.flatMap { annotations -> annotations.filterIsInstance<Query>().map { it.value } }

    private fun pathNames(method: Method): List<String> =
        method.parameterAnnotations.flatMap { annotations -> annotations.filterIsInstance<Path>().map { it.value } }

    // ── Le jeton ─────────────────────────────────────────────────────────────

    @Test
    fun `registering the token is a POST to the gateway route with a body`() {
        val method = method(NotificationApi::class.java, "registerDeviceToken")

        assertThat(wireOf(method)).isEqualTo(Wire("POST", "users/register-device-token", hasBody = true))
        assertThat(method.parameterTypes.first()).isEqualTo(RegisterDeviceTokenRequest::class.java)
    }

    /** `@HTTP(hasBody = true)` : la seule façon qu'a Retrofit d'accepter un DELETE avec corps. */
    @Test
    fun `unregistering the token is a DELETE declared with hasBody`() {
        val method = method(NotificationApi::class.java, "unregisterDeviceToken")

        assertThat(method.getAnnotation(DELETE::class.java)).isNull()
        assertThat(wireOf(method)).isEqualTo(Wire("DELETE", "users/register-device-token", hasBody = true))
        assertThat(method.parameterTypes.first()).isEqualTo(UnregisterDeviceTokenRequest::class.java)
        assertThat(bodyParameters(method)).containsExactly(0)
    }

    // ── La liste et ses filtres ──────────────────────────────────────────────

    @Test
    fun `the list route keeps its parameters and adds the two category filters at the end`() {
        val method = method(NotificationApi::class.java, "list")

        assertThat(wireOf(method)).isEqualTo(Wire("GET", "notifications", hasBody = false))
        assertThat(queryNames(method))
            .containsExactly("offset", "limit", "unreadOnly", "cursor", "types", "hideReadTypes")
            .inOrder()
    }

    @Test
    fun `the counts route is a plain GET`() {
        assertThat(wireOf(method(NotificationApi::class.java, "counts")))
            .isEqualTo(Wire("GET", "notifications/counts", hasBody = false))
    }

    // ── La consommation ──────────────────────────────────────────────────────

    @Test
    fun `conversation and post consumption are POSTs with a single path variable`() {
        val conversation = method(NotificationApi::class.java, "markConversationAsRead")
        val post = method(NotificationApi::class.java, "markPostAsRead")

        assertThat(wireOf(conversation))
            .isEqualTo(Wire("POST", "notifications/conversation/{conversationId}/read", hasBody = false))
        assertThat(pathNames(conversation)).containsExactly("conversationId")
        assertThat(wireOf(post)).isEqualTo(Wire("POST", "notifications/post/{postId}/read", hasBody = false))
        assertThat(pathNames(post)).containsExactly("postId")
    }

    @Test
    fun `read by types is a POST that carries the types body`() {
        val method = method(NotificationApi::class.java, "markTypesAsRead")

        assertThat(wireOf(method)).isEqualTo(Wire("POST", "notifications/read-by-types", hasBody = true))
        assertThat(method.parameterTypes.first()).isEqualTo(ReadNotificationsByTypesRequest::class.java)
    }

    @Test
    fun `the delivery receipt is an empty POST on the conversation`() {
        val method = method(ConversationApi::class.java, "markReceived")

        assertThat(wireOf(method)).isEqualTo(Wire("POST", "conversations/{id}/mark-as-received", hasBody = false))
        assertThat(pathNames(method)).containsExactly("id")
    }

    // ── La classe entière de défauts ─────────────────────────────────────────

    /**
     * Toute méthode dont le verbe n'admet pas de corps (GET, HEAD, DELETE, ou
     * `@HTTP(hasBody = false)`) ne porte AUCUN paramètre `@Body`. Les interfaces sont
     * celles dont un fichier `*Api.kt` existe dans le module — la liste ne se
     * tient pas à la main.
     */
    @Test
    fun `no bodiless verb carries a Body parameter in any Api interface`() {
        val interfaces = RetrofitRouteSources.apiSourceFiles()
            .map { Class.forName("me.meeshy.sdk.net.api.${it.nameWithoutExtension}") }
            .filter { it.isInterface }
        assertThat(interfaces.size).isAtLeast(20)

        val offenders = interfaces.flatMap { type ->
            type.declaredMethods
                .filter { forbidsBody(it) && bodyParameters(it).isNotEmpty() }
                .map { "${type.simpleName}.${it.name}" }
        }

        assertThat(offenders).isEmpty()
    }

    /**
     * La preuve que Retrofit ACCEPTE les interfaces du lot : `validateEagerly`
     * analyse chaque méthode à la création, là où `@DELETE` + `@Body` aurait levé.
     */
    @Test
    fun `every Api interface of the contract is a valid Retrofit declaration`() {
        val retrofit = Retrofit.Builder()
            .baseUrl(RecordingHttp.BASE_URL)
            .addConverterFactory(JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()))
            .validateEagerly(true)
            .build()

        listOf(NotificationApi::class.java, CallApi::class.java, SignalApi::class.java).forEach { type ->
            assertThat(retrofit.create(type)).isNotNull()
        }
    }
}
