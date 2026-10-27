package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #13364 — sur iOS tout écran empilé a une flèche « < » ; sur Android 9 (pas de retour système) l'oublier laisse
 * l'utilisateur sans issue. Ce témoin énumère les routes du graphe (lues dans les sources, comme
 * [NavGraphRouteSetTest]) et exige de chacune un rôle déclaré dans [NavBackChrome] : racine, écran empilé qui
 * PORTE la flèche (preuve : le fichier d'écran en contient la marque), ou feuille modale comme sur iOS.
 */
class NavBackChromeTest {

    private val androidRoot: File = generateSequence(File(".").canonicalFile) { it.parentFile }
        .first { File(it, "gradle/libs.versions.toml").isFile }

    private val graphDir = File(androidRoot, "app/src/main/kotlin/me/meeshy/app/navigation/graph")

    private val arrowMarkers = Regex(
        "MeeshyBackButton|HeaderBackButton|CollapsibleHeader|MeeshyIcons\\.Back|MeeshyIcons\\.ChevronBackward|" +
            "ArrowBack|CommunityRoundButton|FullscreenChromeSymbol\\.Back|SettingsDetailScaffold|SettingsSubScreen|" +
            "backArrowColor|MeeshyTopBar\\(.{0,200}onBack =",
        RegexOption.DOT_MATCHES_ALL,
    )

    /** Chaque route déclarée dans un `composable(...)` du graphe, écrite comme dans la source (`Routes.X`, `Classe.ROUTE`). */
    private fun declaredRoutes(): List<String> = graphDir.listFiles { f -> f.extension == "kt" }.orEmpty()
        .flatMap { file ->
            Regex("""[cC]omposable\(\s*(?:route = )?("[^"]*"|[A-Za-z_.]+)""").findAll(file.readText()).map { m ->
                val raw = m.groupValues[1]
                val inner = Regex("""\$\{([A-Za-z_.]+)}""").find(raw)?.groupValues?.get(1)
                when {
                    inner != null -> inner
                    raw == "ROUTE" -> "${file.nameWithoutExtension}.ROUTE"
                    else -> raw
                }
            }.toList()
        }
        .filterNot { it == "route" }

    @Test
    fun `every route the graph declares has a back role`() {
        val registered = NavBackChrome.entries.map { it.source }.toSet()
        val missing = declaredRoutes().filterNot { it in registered }
        assertWithMessage(
            "Route(s) sans rôle de retour : $missing. Déclarer la route dans NavBackChrome (ROOT, ARROW avec le " +
                "fichier qui porte MeeshyBackButton, ou MODAL comme iOS).",
        ).that(missing).isEmpty()
    }

    @Test
    fun `the registry names no route the graph has dropped`() {
        val declared = declaredRoutes().toSet()
        val stale = NavBackChrome.entries.map { it.source }.filterNot { it in declared }
        assertWithMessage("Entrée(s) de registre sans destination : $stale").that(stale).isEmpty()
    }

    @Test
    fun `no route is registered twice`() {
        val sources = NavBackChrome.entries.map { it.source }
        val routes = NavBackChrome.entries.map { it.route }
        assertThat(sources).containsNoDuplicates()
        assertThat(routes).containsNoDuplicates()
    }

    @Test
    fun `every stacked screen carries the back arrow in its source`() {
        val missing = NavBackChrome.entries.filter { it.chrome == BackChrome.ARROW }.filterNot { entry ->
            val file = File(androidRoot, checkNotNull(entry.evidence) { "${entry.source} : ARROW sans preuve" })
            file.isFile && arrowMarkers.containsMatchIn(file.readText())
        }
        assertWithMessage(
            "Écran(s) empilé(s) sans flèche de retour : ${missing.map { "${it.source} -> ${it.evidence}" }}",
        ).that(missing).isEmpty()
    }

    @Test
    fun `an arrow route always names its evidence and a non arrow route never does`() {
        NavBackChrome.entries.forEach { entry ->
            if (entry.chrome == BackChrome.ARROW) assertThat(entry.evidence).isNotNull()
            else assertThat(entry.evidence).isNull()
        }
    }

    @Test
    fun `roots and immersive screens follow iOS and carry no edge swipe`() {
        assertThat(NavBackChrome.entries.filter { it.chrome == BackChrome.ROOT }.map { it.source }).containsExactly(
            "Routes.LOGIN", "Routes.MAGIC_LINK_VALIDATE", "Routes.CONVERSATIONS", "Routes.FEED",
        )
        assertThat(NavBackChrome.entries.filter { it.chrome == BackChrome.MODAL }.map { it.source }).containsExactly(
            "Routes.MOOD_SPOTLIGHT", "Routes.REELS", "Routes.STORY_VIEWER", "Routes.STORY_COMPOSER_ROUTE",
            "Routes.REPORT_USER", "Routes.CALL", "CommunityRoutes.SETTINGS", "CommunityRoutes.INVITE",
        )
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.CONVERSATIONS)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.REELS)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.CALLS)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.NOTIFICATIONS)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(null)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled("route-inconnue")).isFalse()
    }
}
