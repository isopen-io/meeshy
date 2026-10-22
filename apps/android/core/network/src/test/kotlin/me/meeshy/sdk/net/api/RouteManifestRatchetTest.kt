package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Chaque route qu'une interface `*Api.kt` déclare EXISTE dans le manifeste des
 * routes de la passerelle (`services/gateway/route-manifest.json`, produit
 * mécaniquement depuis le Fastify assemblé).
 *
 * ## La dérive que cette garde ferme
 *
 * Les routes `notifications/device-token` n'ont jamais existé : l'enregistrement du
 * jeton push répondait 404 en silence, et le désenregistrement (un `DELETE` avec
 * corps) levait dès le premier appel. Rien ne rougissait — aucun témoin ne
 * confrontait ce qu'Android APPELLE à ce que la passerelle SERT. `ApiPathLiteralGuardTest`
 * fait l'inverse (aucun littéral de chemin hors d'une interface) ; ici on contrôle
 * l'intérieur des interfaces.
 *
 * ## Un cliquet, pas une liste blanche
 *
 * [TOLERATED_DRIFT] est VIDE et ne peut que le rester : une entrée y est un écart
 * connu avec une issue, jamais une route oubliée. Une entrée qui n'est plus un écart
 * fait échouer le test, pour qu'on la retire — le cliquet ne se desserre pas en silence.
 */
class RouteManifestRatchetTest {

    /** `"VERBE chemin"` d'un écart connu, avec son issue en commentaire. Vide aujourd'hui. */
    private val TOLERATED_DRIFT: Set<String> = emptySet()

    private data class ServedRoute(val verb: String, val segments: List<String>)

    private fun manifest(): List<ServedRoute> {
        val root = RepositoryRoot.containing("services/gateway/route-manifest.json")
        val file = File(root, "services/gateway/route-manifest.json")
        val routes = Json.parseToJsonElement(file.readText()).jsonObject["routes"]?.jsonArray
        checkNotNull(routes) { "le manifeste ${file.path} n'a pas de tableau routes" }
        return routes.map { it as JsonObject }.map { route ->
            ServedRoute(
                verb = route.getValue("method").jsonPrimitive.content.uppercase(),
                segments = RetrofitRouteSources.canonical(route.getValue("path").jsonPrimitive.content),
            )
        }
    }

    /** Les routes déclarées que le manifeste ne sert pas, le préfixe d'API `/api/v1` étant ajouté par le transport. */
    private fun unserved(declared: List<DeclaredRoute>, served: List<ServedRoute>): List<DeclaredRoute> =
        declared.filter { route ->
            val wanted = RetrofitRouteSources.canonical("api/v1/${route.path}")
            served.none { it.verb == route.verb && serves(it.segments, wanted) }
        }

    /**
     * Une route servie répond à la route déclarée quand elles sont IDENTIQUES, ou quand la
     * déclarée porte une variable là où la passerelle sert un littéral par valeur
     * (`packs/{domain}/installed` face à `packs/wallpaper/installed`). Jamais l'inverse : une
     * variable servie ne répond pas à un littéral déclaré (voir [RetrofitRouteSources.sameRoute]).
     */
    private fun serves(served: List<String>, declared: List<String>): Boolean =
        served.size == declared.size &&
            served.indices.all { declared[it] == "*" || declared[it] == served[it] }

    @Test
    fun `the scan sees the declared routes — a guard that reads nothing protects nothing`() {
        val declared = RetrofitRouteSources.declared()

        assertThat(declared.size).isAtLeast(150)
        assertThat(manifest().size).isAtLeast(500)
        assertThat(declared.map { it.label }).contains("POST users/register-device-token (NotificationApi.kt)")
    }

    @Test
    fun `every route an Api interface declares is served by the gateway`() {
        val offenders = unserved(RetrofitRouteSources.declared(), manifest())
            .filter { "${it.verb} ${it.path}" !in TOLERATED_DRIFT }

        assertThat(offenders.map { it.label }).isEmpty()
    }

    @Test
    fun `a tolerated drift that no longer drifts must be removed`() {
        val stillDrifting = unserved(RetrofitRouteSources.declared(), manifest()).map { "${it.verb} ${it.path}" }

        assertThat(TOLERATED_DRIFT.filter { it !in stillDrifting }).isEmpty()
    }

    /** Le témoin négatif, sur la route qui était fausse : la garde sait échouer. */
    @Test
    fun `the retired device-token routes are reported as unserved`() {
        val retired = listOf(
            DeclaredRoute("NotificationApi.kt", "POST", "notifications/device-token"),
            DeclaredRoute("NotificationApi.kt", "DELETE", "notifications/device-token"),
        )

        assertThat(unserved(retired, manifest())).containsExactlyElementsIn(retired)
    }

    @Test
    fun `a served path under the wrong verb is reported`() {
        val wrongVerb = listOf(DeclaredRoute("NotificationApi.kt", "PATCH", "notifications/{id}/read"))

        assertThat(unserved(wrongVerb, manifest())).hasSize(1)
    }

    /** Les routes de ce lot, nommées : elles sont déclarées ET servies. */
    @Test
    fun `the routes of the notification and call contract are all in the manifest`() {
        val expected = listOf(
            "POST users/register-device-token",
            "DELETE users/register-device-token",
            "GET notifications",
            "GET notifications/counts",
            "POST notifications/conversation/{conversationId}/read",
            "POST notifications/post/{postId}/read",
            "POST notifications/read-by-types",
            "POST conversations/{id}/mark-as-received",
            "POST calls",
            "GET calls/{callId}",
            "DELETE calls/{callId}",
            "POST calls/{callId}/participants",
            "DELETE calls/{callId}/participants/{participantId}",
            "POST calls/{callId}/recordings/{recordingId}/attachment",
            "GET calls/{callId}/transcript",
            "DELETE calls/history/{callId}",
            "DELETE calls/history",
            "POST signal/keys",
            "GET signal/keys/{userId}",
            "POST signal/session/establish",
        )
        val declared = RetrofitRouteSources.declared().map { "${it.verb} ${it.path}" }
        val served = manifest()

        assertThat(declared).containsAtLeastElementsIn(expected)
        expected.forEach { line ->
            val verb = line.substringBefore(' ')
            val wanted = RetrofitRouteSources.canonical("api/v1/${line.substringAfter(' ')}")
            assertThat(served.any { it.verb == verb && RetrofitRouteSources.sameRoute(it.segments, wanted) })
                .isTrue()
        }
    }
}
