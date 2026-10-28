package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.navigation.graph.CommunityRoutes
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
            "backArrowColor|leadingNavigationIcon|MeeshyTopBar\\(.{0,200}onBack =",
        RegexOption.DOT_MATCHES_ALL,
    )

    private val closeMarkers = Regex(
        "MeeshyIcons\\.(Close|Xmark)|onClose|onDone|onDismiss|onCancel|common_(cancel|done|ok)|" +
            "leadingNavigationIcon|HeaderBackButton|MeeshyBackButton|CollapsibleHeader|SettingsSubScreen",
    )

    /** Chaque route déclarée dans un `composable(...)` du graphe, écrite comme dans la source (`Routes.X`, `Classe.ROUTE`). */
    private fun declaredRoutes(): List<String> = declaredRoutes(Regex("""[cC]omposable\(\s*(?:route = )?("[^"]*"|[A-Za-z_.]+)"""))

    /** Les routes déclarées par `sheetComposable(...)` : celles que l'hôte de feuilles présente. */
    private fun sheetHostedRoutes(): List<String> =
        declaredRoutes(Regex("""sheetComposable\(\s*(?:route = )?("[^"]*"|[A-Za-z_.]+)"""))

    private fun declaredRoutes(call: Regex): List<String> = graphDir.listFiles { f -> f.extension == "kt" }.orEmpty()
        .flatMap { file ->
            call.findAll(file.readText()).map { m ->
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
    fun `every screen names its evidence and a root never does`() {
        NavBackChrome.entries.forEach { entry ->
            if (entry.chrome == BackChrome.ROOT) assertThat(entry.evidence).isNull()
            else assertWithMessage(entry.source).that(entry.evidence).isNotNull()
        }
    }

    @Test
    fun `every sheet or full screen carries a cross or text buttons in its source, never as an arrow route`() {
        val missing = NavBackChrome.entries.filter { it.chrome == BackChrome.MODAL }.filterNot { entry ->
            val file = File(androidRoot, checkNotNull(entry.evidence))
            file.isFile && closeMarkers.containsMatchIn(file.readText())
        }
        assertWithMessage(
            "Feuille(s) sans croix ni bouton de fermeture : ${missing.map { "${it.source} -> ${it.evidence}" }}",
        ).that(missing).isEmpty()
    }

    @Test
    fun `the back chrome follows how iOS presents the screen`() {
        val wrong = NavBackChrome.entries.filterNot { entry ->
            when (entry.ios) {
                IosPresentation.PUSH -> entry.chrome == BackChrome.ARROW
                IosPresentation.PUSH_CLOSE -> entry.chrome == BackChrome.MODAL
                IosPresentation.SHEET, IosPresentation.COVER -> entry.chrome == BackChrome.MODAL
                IosPresentation.NONE -> entry.chrome != BackChrome.MODAL
            }
        }
        assertWithMessage(
            "Rôle de retour contraire à la présentation iOS (écran poussé ⇒ flèche, feuille ⇒ boutons ou croix) : " +
                wrong.map { "${it.source} : iOS ${it.ios}, Android ${it.chrome}" },
        ).that(wrong).isEmpty()
    }

    @Test
    fun `no route iOS presents as a sheet or a cover is still a stacked screen`() {
        val stacked = NavBackChrome.entries
            .filter { it.chrome == BackChrome.ARROW && it.ios in setOf(IosPresentation.SHEET, IosPresentation.COVER) }
            .map { it.source }
        assertWithMessage("#13369 : écran(s) empilé(s) que iOS présente en feuille : $stacked").that(stacked).isEmpty()
    }

    @Test
    fun `a route is presented by the sheet host exactly when the registry says so`() {
        assertThat(sheetHostedRoutes().toSet())
            .containsExactlyElementsIn(NavBackChrome.entries.filter { it.viaSheetHost }.map { it.source })
    }

    /** Les routes que l'hôte présente en plein écran : `style = SheetStyle.COVER` dans l'appel, avant la lambda. */
    private fun coverHostedRoutes(): Set<String> {
        val call = Regex("""sheetComposable\(\s*(?:route = )?("[^"]*"|[A-Za-z_.]+)""")
        return graphDir.listFiles { f -> f.extension == "kt" }.orEmpty().flatMap { file ->
            val text = file.readText()
            call.findAll(text).filter { m ->
                val head = text.substring(m.range.first, text.indexOf("->", m.range.last).takeIf { it > 0 } ?: text.length)
                "SheetStyle.COVER" in head
            }.map { it.groupValues[1] }.toList()
        }.toSet()
    }

    @Test
    fun `the sheet host presents full screen exactly the routes iOS presents as a cover`() {
        val iosCovers = NavBackChrome.entries.filter { it.viaSheetHost && it.ios == IosPresentation.COVER }.map { it.source }
        assertWithMessage("`.fullScreenCover` iOS ⇔ SheetStyle.COVER (pas de glissé vers le bas sur un plein écran)")
            .that(coverHostedRoutes()).containsExactlyElementsIn(iosCovers)
        assertThat(iosCovers).containsAtLeast("Routes.REGISTRATION", "Routes.GLOBAL_SEARCH")
    }

    @Test
    fun `a route iOS presents as a sheet or cover is a modal, never a stacked screen`() {
        val hosted = NavBackChrome.entries.filter { it.viaSheetHost }
        assertThat(hosted.map { it.ios }.toSet()).containsNoneOf(IosPresentation.PUSH, IosPresentation.PUSH_CLOSE, IosPresentation.NONE)
        assertThat(hosted.map { it.chrome }.toSet()).containsExactly(BackChrome.MODAL)
        assertThat(NavBackChrome.entries.filter { it.viaSheetHost }.all { !NavBackChrome.edgeSwipeBackEnabled(it.route) }).isTrue()
    }

    @Test
    fun `roots and immersive screens follow iOS and carry no edge swipe`() {
        assertThat(NavBackChrome.entries.filter { it.chrome == BackChrome.ROOT }.map { it.source }).containsExactly(
            "Routes.LOGIN", "Routes.MAGIC_LINK_VALIDATE", "Routes.VERIFY_EMAIL_LINK", "Routes.CONVERSATIONS", "Routes.FEED",
        )
        assertThat(NavBackChrome.entries.filter { it.chrome == BackChrome.MODAL && !it.viaSheetHost }.map { it.source }).containsExactly(
            "Routes.MOOD_SPOTLIGHT", "Routes.REELS", "Routes.STORY_VIEWER", "Routes.COMPOSER", "Routes.STORY_COMPOSER_ROUTE",
            "Routes.PROFILE_USER", "Routes.CALL",
        )
        assertThat(NavBackChrome.edgeSwipeBackEnabled(CommunityRoutes.SETTINGS)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(CommunityRoutes.INVITE)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.CONVERSATIONS)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.REELS)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.CALLS)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.NOTIFICATIONS)).isTrue()
        assertThat(NavBackChrome.edgeSwipeBackEnabled(null)).isFalse()
        assertThat(NavBackChrome.edgeSwipeBackEnabled("route-inconnue")).isFalse()
    }

    @Test
    fun `no source draws the Material back arrow, the back glyph is the chevron of iOS`() {
        val offenders = androidRoot.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" && it.name != "test" && it.name != "androidTest" }
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path }
            .filter { Regex("""\bArrowBack\b""").containsMatchIn(it.readText()) }
            .map { it.relativeTo(androidRoot).path }
            .toList()
        assertWithMessage("#13377 : flèche Material « ← » au lieu du chevron « < » (MeeshyIcons.Back) : $offenders")
            .that(offenders).isEmpty()
    }
}
