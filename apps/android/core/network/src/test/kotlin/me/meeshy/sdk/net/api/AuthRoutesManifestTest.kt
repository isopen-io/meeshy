package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT

/**
 * Chaque route des interfaces d'authentification existe dans le MANIFESTE de la
 * passerelle (`services/gateway/route-manifest.json`, produit mecaniquement depuis
 * le Fastify assemble) — avec son VERBE. Une route inventee, un chemin mal copie ou
 * un POST la ou le serveur sert un GET tombe ici avant d'etre un 404 en production.
 *
 * Le motif de recherche du depot est celui d'`ApiPathLiteralGuardTest` : on remonte
 * jusqu'au manifeste, et on echoue FORT s'il est introuvable — une garde qui ne
 * lit rien passe au vert en silence.
 */
class AuthRoutesManifestTest {

    private val apiPrefix = "/api/v1/"

    private val interfaces: List<Class<*>> = listOf(
        AuthApi::class.java,
        PhoneTransferApi::class.java,
        AnonymousApi::class.java,
        InvitationApi::class.java,
    )

    private fun racineDepot(): File {
        var courant: File? = File(".").absoluteFile
        repeat(8) {
            val ici = courant ?: return@repeat
            if (File(ici, "services/gateway/route-manifest.json").isFile) return ici
            courant = ici.parentFile
        }
        error("racine du depot introuvable depuis ${File(".").absolutePath}")
    }

    /** `(VERBE, segments)`, tout segment variable valant `*`. */
    private fun canonise(chemin: String): List<String> =
        chemin.substringBefore('?').split('/').map { if (it.startsWith(":") || it.startsWith("{") || it == "*") "*" else it }

    private fun routesServies(): Set<Pair<String, List<String>>> {
        val manifeste = File(racineDepot(), "services/gateway/route-manifest.json")
        val routes = Json.parseToJsonElement(manifeste.readText()).jsonObject.getValue("routes").jsonArray
        return routes.map { it as JsonObject }
            .map { it.getValue("method").jsonPrimitive.content to canonise(it.getValue("path").jsonPrimitive.content) }
            .toSet()
    }

    private fun routesDeclarees(type: Class<*>, methodNames: Set<String>? = null): List<Pair<String, String>> =
        type.declaredMethods.filter { methodNames == null || it.name in methodNames }.mapNotNull { method ->
            method.getAnnotation(GET::class.java)?.let { "GET" to it.value }
                ?: method.getAnnotation(POST::class.java)?.let { "POST" to it.value }
                ?: method.getAnnotation(PUT::class.java)?.let { "PUT" to it.value }
                ?: method.getAnnotation(PATCH::class.java)?.let { "PATCH" to it.value }
                ?: method.getAnnotation(DELETE::class.java)?.let { "DELETE" to it.value }
        }

    @Test
    fun `le balayage voit des routes - sinon la garde passerait au vert en ne lisant rien`() {
        assertThat(routesServies().size).isAtLeast(100)
        assertThat(interfaces.sumOf { routesDeclarees(it).size }).isAtLeast(40)
    }

    @Test
    fun `chaque route d'authentification declaree est servie, avec son verbe`() {
        val servies = routesServies()

        val inconnues = interfaces.flatMap { type ->
            routesDeclarees(type).mapNotNull { (verbe, chemin) ->
                val cle = verbe to canonise(apiPrefix + chemin)
                if (cle in servies) null else "${type.simpleName}  $verbe $chemin"
            }
        }

        assertThat(inconnues).isEmpty()
    }

    /**
     * Les chemins de suppression de compte sont ALIGNES sur le manifeste avant que rien
     * ne s'y ajoute : `POST /me/account/deletion` (mot de passe courant exige, #4183) est
     * servi ; l'ancien `DELETE /me/delete-account` n'est plus appele d'ici.
     */
    @Test
    fun `la suppression de compte vise une route servie`() {
        val servies = routesServies()
        val declarees = routesDeclarees(UserApi::class.java, setOf("openAccountDeletion"))

        assertThat(declarees).containsExactly("POST" to "me/account/deletion")
        assertThat(declarees.all { (verbe, chemin) -> (verbe to canonise(apiPrefix + chemin)) in servies }).isTrue()
    }

    @Test
    fun `les routes du contrat d'authentification sont toutes declarees`() {
        val declarees = interfaces.flatMap(::routesDeclarees).map { (verbe, chemin) -> verbe to canonise(apiPrefix + chemin) }.toSet()

        val attendues = listOf(
            "POST" to "auth/login",
            "POST" to "auth/login/2fa",
            "POST" to "auth/verify-email",
            "POST" to "auth/resend-verification",
            "POST" to "auth/verification/status",
            "POST" to "auth/reset-password/verify-token",
            "POST" to "auth/reset-password",
            "POST" to "auth/forgot-password/phone/lookup",
            "POST" to "auth/forgot-password/phone/verify-identity",
            "POST" to "auth/forgot-password/phone/verify-code",
            "POST" to "auth/forgot-password/phone/resend",
            "POST" to "auth/send-phone-code",
            "POST" to "auth/verify-phone",
            "POST" to "auth/phone-transfer/check",
            "POST" to "auth/phone-transfer/initiate",
            "POST" to "auth/phone-transfer/verify",
            "POST" to "auth/phone-transfer/resend",
            "POST" to "auth/phone-transfer/cancel",
            "POST" to "auth/phone-transfer/initiate-registration",
            "POST" to "auth/phone-transfer/verify-registration",
            "POST" to "auth/logout",
            "POST" to "auth/2fa/verify",
            "POST" to "auth/2fa/cancel",
            "GET" to "auth/me",
            "POST" to "anonymous/refresh",
            "POST" to "invitations/email",
        )

        val manquantes = attendues.filter { (verbe, chemin) -> (verbe to canonise(apiPrefix + chemin)) !in declarees }

        assertThat(manquantes).isEmpty()
    }
}
