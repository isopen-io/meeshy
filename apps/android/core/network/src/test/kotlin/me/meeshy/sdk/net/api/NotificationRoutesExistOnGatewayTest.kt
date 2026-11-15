package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Chaque chemin de `NotificationApi` — et la route d'accusé de réception de
 * `ConversationApi` — est ENREGISTRÉ dans les sources de la passerelle.
 *
 * Complète `RouteManifestRatchetTest`, qui confronte au manifeste généré : ici on
 * lit les fichiers que le lot nomme (`routes/notifications.ts`, `push-tokens.ts`,
 * `message-read-status.ts`) pour que la preuve ne dépende pas d'un manifeste qu'un
 * oubli de régénération aurait laissé en retard.
 *
 * ## Pourquoi cette garde ne peut pas passer au vert en ne lisant rien
 *
 * Même motif que `ApiPathLiteralGuardTest` : le répertoire de la passerelle se
 * cherche en REMONTANT, et son absence échoue FORT (`error`) au lieu de rendre une
 * liste vide. Chaque fichier doit en outre livrer au moins une route, et le témoin
 * négatif confirme qu'un chemin inventé est bien dénoncé.
 */
class NotificationRoutesExistOnGatewayTest {

    private val gatewayFiles = listOf("notifications.ts", "push-tokens.ts", "message-read-status.ts")

    private val registration = Regex(
        """\.(get|post|put|patch|delete)\s*(?:<[^()]*>)?\s*\(\s*['"`]([^'"`]+)['"`]""",
    )

    private fun routesDirectory(): File {
        val root = RepositoryRoot.containing("services/gateway/src/routes/notifications.ts")
        return File(root, "services/gateway/src/routes")
    }

    /** `VERBE segments` pour chaque route que les fichiers nommés enregistrent. */
    private fun registered(): Set<Pair<String, List<String>>> {
        val directory = routesDirectory()
        return gatewayFiles.flatMap { name ->
            val file = File(directory, name)
            check(file.isFile) { "fichier de routes de la passerelle introuvable : ${file.path}" }
            val routes = registration.findAll(file.readText()).map { match ->
                match.groupValues[1].uppercase() to RetrofitRouteSources.canonical(match.groupValues[2])
            }.toList()
            check(routes.isNotEmpty()) { "${file.path} : aucune route lue — la garde est aveugle" }
            routes
        }.toSet()
    }

    private fun missingFrom(declared: List<DeclaredRoute>, gateway: Set<Pair<String, List<String>>>): List<DeclaredRoute> =
        declared.filter { route ->
            val wanted = route.verb to RetrofitRouteSources.canonical(route.path)
            gateway.none { it.first == wanted.first && RetrofitRouteSources.sameRoute(it.second, wanted.second) }
        }

    private fun notificationRoutes(): List<DeclaredRoute> {
        val file = RetrofitRouteSources.apiSourceFiles().single { it.name == "NotificationApi.kt" }
        return RetrofitRouteSources.routesOf(file)
    }

    private fun deliveryReceiptRoute(): List<DeclaredRoute> {
        val file = RetrofitRouteSources.apiSourceFiles().single { it.name == "ConversationApi.kt" }
        return RetrofitRouteSources.routesOf(file).filter { it.path == "conversations/{id}/mark-as-received" }
    }

    @Test
    fun `the gateway files are found and registered routes are read from each`() {
        val routes = registered()

        assertThat(routes.size).isAtLeast(15)
        assertThat(routes).contains("POST" to listOf("users", "register-device-token"))
        assertThat(routes).contains("DELETE" to listOf("users", "register-device-token"))
    }

    @Test
    fun `every NotificationApi path exists on the gateway under the same verb`() {
        val declared = notificationRoutes()

        assertThat(declared.size).isAtLeast(11)
        assertThat(missingFrom(declared, registered()).map { it.label }).isEmpty()
    }

    @Test
    fun `the delivery receipt route exists on the gateway`() {
        val declared = deliveryReceiptRoute()

        assertThat(declared).hasSize(1)
        assertThat(missingFrom(declared, registered()).map { it.label }).isEmpty()
    }

    /** Le témoin négatif : les deux adresses qui n'ont jamais existé sont dénoncées. */
    @Test
    fun `invented device-token paths are reported as missing`() {
        val invented = listOf(
            DeclaredRoute("NotificationApi.kt", "POST", "notifications/device-token"),
            DeclaredRoute("NotificationApi.kt", "DELETE", "notifications/device-token"),
        )

        assertThat(missingFrom(invented, registered())).containsExactlyElementsIn(invented)
    }
}
