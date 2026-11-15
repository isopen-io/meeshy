package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Les chemins déclarés par les interfaces Retrofit du jeu sont ÉGAUX à ceux de `packages/shared/types/game-routes.ts`
 * (`GAME_ROUTES`, `GAME_INTEGRATION_ROUTES`, `GAME_PHOTO_ROUTES`) et de `game-archive-routes.ts` : un chemin du
 * contrat qu'Android n'appelle pas, ou appelle sous un autre verbe, fait échouer ce test.
 */
class GameRoutesParityTest {

    private fun read(name: String): String =
        File(RepositoryRoot.containing("packages/shared/types/$name"), "packages/shared/types/$name").readText()

    private fun table(source: String, name: String): Map<String, String> {
        val body = Regex("""export const $name = \{(.*?)\} as const""", RegexOption.DOT_MATCHES_ALL)
            .find(source)?.groupValues?.get(1) ?: error("table $name introuvable")
        return Regex("""^\s*(\w+):\s*'([^']+)'""", RegexOption.MULTILINE).findAll(body)
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    private fun methods(source: String, name: String): Map<String, String> {
        val body = Regex("""export const $name = \{(.*?)\} as const""", RegexOption.DOT_MATCHES_ALL)
            .find(source)?.groupValues?.get(1) ?: error("table $name introuvable")
        return Regex("""(\w+):\s*'(GET|POST|PUT)'""").findAll(body).associate { it.groupValues[1] to it.groupValues[2] }
    }

    private val declared: Set<String> by lazy {
        RetrofitRouteSources.declared()
            .filter { it.source == "GameApi.kt" || it.source == "EngagementApi.kt" }
            .map { it.verb + " " + RetrofitRouteSources.canonical(it.path).joinToString("/") }
            .toSet()
    }

    private fun assertDeclared(verb: String, path: String) {
        val wanted = verb + " " + RetrofitRouteSources.canonical(path).joinToString("/")
        assertThat(declared).contains(wanted)
    }

    @Test
    fun `chaque route du jeu du contrat est declaree avec son verbe`() {
        val routes = read("game-routes.ts")
        val paths = table(routes, "GAME_ROUTES")
        val verbs = methods(routes, "GAME_ROUTE_METHODS") + mapOf(
            "engagement" to "GET", "mint" to "POST", "missionReroll" to "POST", "chestClaim" to "POST",
            "flameFreezes" to "POST", "flameRelight" to "POST", "guideSeen" to "POST",
        )

        assertThat(paths.size).isAtLeast(21)
        assertThat(verbs.keys).containsAtLeastElementsIn(paths.keys)
        paths.forEach { (key, path) -> assertDeclared(verbs.getValue(key), path.removePrefix("/")) }
    }

    @Test
    fun `l integration, les cadres et les archives sont declares avec leur verbe`() {
        val routes = read("game-routes.ts")
        val integration = table(routes, "GAME_INTEGRATION_ROUTES")
        val photo = table(routes, "GAME_PHOTO_ROUTES")
        val photoVerbs = methods(routes, "GAME_PHOTO_ROUTE_METHODS")
        val archive = read("game-archive-routes.ts")

        assertThat(integration.keys).containsExactly("settings", "userGame")
        integration.values.forEach { assertDeclared("GET", it.removePrefix("/")) }
        assertThat(photo).hasSize(4)
        photo.forEach { (key, path) -> assertDeclared(photoVerbs.getValue(key), path.removePrefix("/")) }
        table(archive, "GAME_ARCHIVE_ROUTES").values.forEach { assertDeclared("GET", it.removePrefix("/")) }
    }
}
