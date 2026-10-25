package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.net.api.RepositoryRoot
import me.meeshy.sdk.net.api.RetrofitRouteSources
import org.junit.Test

/**
 * Le cliquet de CLASSEMENT (#11817) : chaque route que la passerelle expose est
 * soit IMPLÉMENTÉE (une interface Retrofit la déclare), soit OPS-ONLY
 * (`packages/shared/api/ops-only-routes.ts`), soit nommée dans
 * `route-classification.json` — hors périmètre mobile, ou à porter.
 *
 * Son jumeau `api.RouteManifestRatchetTest` garde l'autre sens : tout ce
 * qu'Android appelle existe au manifeste.
 *
 * Le seul chiffre qui compte est [TO_PORT_CEILING] : la dette « à porter » ne peut
 * que rétrécir. Porter une route la retire du JSON ET abaisse le plafond ; en
 * ajouter une exige de relever le plafond, donc de le dire en revue.
 */
class RouteManifestRatchetTest {

    private companion object {
        /**
         * 253 : 286 (dev 280 + six routes des lens, #11271) moins les 34 routes « à porter » que les
         * interfaces des liens, du suivi de liens, de l'affiliation, des médias, de l'annuaire, des
         * hashtags et des packs déclarent depuis la vague du 2026-10-23, plus `GET /u/:username`
         * qui y revient : c'est un alias du profil public, qu'aucune interface ne vise (#4161, #4250).
         * 254 : plus `GET /attachments/:attachmentId/subtitles/:lang`, servie par la passerelle depuis
         * #11329 et sans interface Retrofit encore.
         * 262 : plus les huit routes de l'annuaire E2EE par appareil (#3706 : appareils, pré-clés,
         * enveloppes), servies par la passerelle et que l'E2EE Android ne vise pas encore.
         * 263 : plus `DELETE /conversations/:conversationId/encryption` (#12522 : désactivation du
         * régime de chiffrement), servie par la passerelle et sans interface Retrofit encore côté Android.
         * 262 : moins `DELETE /e2ee/devices/:deviceId`, que porte `E2eeDeviceApi` (#13014, « Mes appareils
         * chiffrés ») ; `GET /e2ee/devices`, servie dans le même lot, y naît déjà implémentée.
         */
        const val TO_PORT_CEILING = 262
        val VERB_STATUSES = setOf("hors-perimetre-mobile", "ops-only", "a-porter", "implementee-par-url-serveur")
    }

    private data class Route(val verb: String, val path: String) {
        val key: String get() = "$verb $path"
        val segments: List<String> get() = RetrofitRouteSources.canonical(path)
    }

    private val root: File get() = RepositoryRoot.containing("services/gateway/route-manifest.json")

    private fun manifest(): List<Route> =
        Json.parseToJsonElement(File(root, "services/gateway/route-manifest.json").readText())
            .jsonObject.getValue("routes").jsonArray
            .map { it as JsonObject }
            .map { Route(it.getValue("method").jsonPrimitive.content.uppercase(), it.getValue("path").jsonPrimitive.content) }

    private fun opsOnly(): Set<String> {
        val source = File(root, "packages/shared/api/ops-only-routes.ts").readText()
        return Regex("""method:\s*'(\w+)',\s*path:\s*'([^']+)'""").findAll(source)
            .map { "${it.groupValues[1].uppercase()} ${it.groupValues[2]}" }
            .toSet()
    }

    private data class Category(val status: String, val routes: List<String>)

    private fun classification(): JsonObject {
        val stream = checkNotNull(javaClass.classLoader?.getResourceAsStream("route-classification.json")) {
            "route-classification.json introuvable dans les ressources de test"
        }
        return Json.parseToJsonElement(stream.bufferedReader().readText()).jsonObject
    }

    private fun categories(): List<Category> =
        classification().getValue("categories").jsonArray.map { it as JsonObject }.map { category ->
            Category(
                status = category.getValue("status").jsonPrimitive.content,
                routes = category.getValue("routes").jsonArray.map { it.jsonPrimitive.content },
            )
        }

    private fun implemented(route: Route): Boolean =
        RetrofitRouteSources.declared().any { declared ->
            val wanted = RetrofitRouteSources.canonical("api/v1/${declared.path}")
            declared.verb == route.verb && wanted.size == route.segments.size &&
                wanted.indices.all { wanted[it] == "*" || wanted[it] == route.segments[it] }
        }

    @Test
    fun `the scan sees the manifest, the ops-only list and the classification`() {
        assertThat(manifest().size).isAtLeast(500)
        assertThat(opsOnly()).isNotEmpty()
        assertThat(categories().sumOf { it.routes.size }).isAtLeast(100)
    }

    @Test
    fun `every manifest route is implemented, ops-only or classified`() {
        val classified = categories().flatMap { it.routes }.toSet()
        val ops = opsOnly()

        val unclassified = manifest()
            .filter { it.key !in ops && it.key !in classified }
            .filterNot(::implemented)

        assertThat(unclassified.map { it.key }).isEmpty()
    }

    @Test
    fun `a classified route that is implemented, ops-only or unknown must leave the list`() {
        val served = manifest().associateBy { it.key }
        val ops = opsOnly()

        val stale = categories().flatMap { it.routes }.filter { key ->
            val route = served[key]
            route == null || key in ops || implemented(route)
        }

        assertThat(stale).isEmpty()
    }

    @Test
    fun `the rest of admin and socketio is classified ops-only with a written reason`() {
        val opsOnly = categories().filter { it.status == "ops-only" }
        val classified = opsOnly.flatMap { it.routes }
        val reasons = classification().getValue("categories").jsonArray.map { it as JsonObject }
            .filter { it.getValue("status").jsonPrimitive.content == "ops-only" }
            .map { it.getValue("reason").jsonPrimitive.content }

        assertThat(reasons.all { it.length > 20 }).isTrue()
        val leftover = categories().filter { it.status != "ops-only" }.flatMap { it.routes }
            .filter { it.contains(" /api/v1/admin/") || it.contains("socketio") }
        assertThat(leftover).isEmpty()
        assertThat(classified.any { it.contains("/admin/") }).isTrue()
        assertThat(classified.any { it.contains("socketio") }).isTrue()
    }

    @Test
    fun `no route is classified twice and every status is known`() {
        val all = categories().flatMap { it.routes }

        assertThat(all.groupBy { it }.filterValues { it.size > 1 }.keys).isEmpty()
        assertThat(categories().map { it.status }.toSet() - VERB_STATUSES).isEmpty()
    }

    @Test
    fun `the to-port debt can only shrink`() {
        val toPort = categories().filter { it.status == "a-porter" }.sumOf { it.routes.size }

        assertThat(toPort).isAtMost(TO_PORT_CEILING)
        assertThat(toPort).isAtLeast(TO_PORT_CEILING)
    }

    @Test
    fun `an Api interface that takes a server-rendered Url is a named exception with its reason`() {
        val named = classification().getValue("retrofitExceptions").jsonArray.map { it as JsonObject }
        val namedFiles = named.map { it.getValue("file").jsonPrimitive.content }
        val withUrl = RetrofitRouteSources.apiSourceFiles()
            .filter { Regex("""@Url\b""").containsMatchIn(it.readText()) }
            .map { it.name }

        assertThat(withUrl).containsExactlyElementsIn(namedFiles)
        assertThat(named.map { it.getValue("reason").jsonPrimitive.content }.all { it.length > 20 }).isTrue()
    }

    @Test
    fun `routes served by a server-rendered url all belong to a named exception`() {
        val viaUrl = categories().filter { it.status == "implementee-par-url-serveur" }
        assertThat(viaUrl).isNotEmpty()
        assertThat(viaUrl.flatMap { it.routes }.all { it.contains("/uploads/") }).isTrue()
    }
}
