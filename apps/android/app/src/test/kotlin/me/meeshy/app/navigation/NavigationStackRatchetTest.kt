package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Le cliquet de la pile (#18365) : hors de la garde ([pushFrom], [popFrom], [navigateSingleTop], [AppNavigator]), une
 * poussée ou un retour nus ne s'ajoutent plus. Un `navigate(` sans `launchSingleTop` empile deux écrans pour un double
 * toucher ; un `popBackStack()` nu dépile aussi l'écran du dessous pour un double retour.
 *
 * Ce qui est compté, dans `app/src/main` (lignes de commentaire exclues) : (a) chaque appel `navigate(`, tous récepteurs,
 * et chaque référence `::navigate`, hors `navigator.navigate(`, hors déclarations, hors des fichiers de la garde, et hors
 * des appels dont les arguments ou le constructeur de fin nomment `launchSingleTop` ; (b) chaque `popBackStack()` et
 * chaque `navigateUp()` sans argument (le même retour nu sous un autre nom), hors du routeur et des feuilles.
 *
 * Mesuré le 2026-11-14 sur 4afe432feb : 190 poussées et 49 retours nus. Ce lot les ramène à 11 et 0 ; le reste vit dans
 * des calques que les lots suivants migrent. Abaisser, jamais relever.
 */
class NavigationStackRatchetTest {

    internal data class Site(val file: String, val line: Int)

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")
    private val navigateCall = Regex("""(?<!\w)navigate\(|::navigate\b""")
    private val popCall = Regex("""(?<!\w)(popBackStack|navigateUp)\(\)""")
    private val declaration = Regex("""\bfun\s+(\w+\.)?$""")
    private val navigateExempt = setOf("StackGuard.kt", "AppNavigator.kt", "TopLevelNavigation.kt", "SheetReturn.kt")
    private val popExempt = setOf("AppNavigator.kt", "SheetReturn.kt", "SheetDestination.kt")

    private fun clean(source: String) = source.lines().joinToString("\n") { if (commentLine.containsMatchIn(it)) "" else it }

    private fun lineOf(text: String, index: Int) = text.substring(0, index).count { it == '\n' } + 1

    internal fun bareNavigations(source: String, file: String = "demo/Screen.kt"): List<Site> {
        val text = clean(source)
        return navigateCall.findAll(text)
            .filterNot { declaration.containsMatchIn(text.substring(maxOf(0, it.range.first - 60), it.range.first)) }
            .filterNot { text.substring(maxOf(0, it.range.first - 10), it.range.first).endsWith("navigator.") }
            .filterNot { "launchSingleTop" in callExtent(text, it) }
            .map { Site(file, lineOf(text, it.range.first)) }
            .toList()
    }

    internal fun barePops(source: String, file: String = "demo/Screen.kt"): List<Site> {
        val text = clean(source)
        return popCall.findAll(text).map { Site(file, lineOf(text, it.range.first)) }.toList()
    }

    private fun callExtent(text: String, match: MatchResult): String {
        if (match.value.startsWith("::")) return ""
        val argumentsEnd = closing(text, match.range.last + 1, '(', ')')
        var index = argumentsEnd
        while (index < text.length && (text[index] == ' ' || text[index] == '\t')) index++
        val trailingEnd = if (index < text.length && text[index] == '{') closing(text, index + 1, '{', '}') else argumentsEnd
        return text.substring(match.range.last + 1, trailingEnd)
    }

    private fun closing(text: String, from: Int, open: Char, close: Char): Int {
        var depth = 1
        var index = from
        while (depth > 0 && index < text.length) {
            depth += when (text[index]) {
                open -> 1
                close -> -1
                else -> 0
            }
            index++
        }
        return index
    }

    private fun mainSources(): List<File> =
        File("src/main/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    private fun File.site() = path.replace(File.separatorChar, '/')

    private fun navigations(): List<Site> =
        mainSources().filter { it.name !in navigateExempt }.flatMap { bareNavigations(it.readText(), it.site()) }

    private fun pops(): List<Site> =
        mainSources().filter { it.name !in popExempt }.flatMap { barePops(it.readText(), it.site()) }

    @Test
    fun `l'analyse voit les sources - sinon la garde passerait en ne lisant rien`() {
        val graphs = mainSources().filter { "/navigation/graph/" in it.site() }
        assertThat(graphs.size).isAtLeast(10)
        assertThat(graphs.count { "pushFrom(" in it.readText() }).isAtLeast(1)
    }

    @Test
    fun `la regle compte les poussees nues et ignore la garde, le routeur, launchSingleTop et les commentaires`() {
        val found = bareNavigations(
            """
            // navController.navigate(Routes.X) dans un commentaire
            fun NavController.navigateToTopLevel(route: String) {}
            navController.navigate(Routes.SETTINGS)
            navigator.navigate(Routes.SETTINGS)
            navController.navigate(Routes.CALL) { launchSingleTop = true }
            navController.navigate(
                Routes.CHAT,
            )
            Routes.composer(origin)?.let(navController::navigate)
            navController.pushFrom(entry, Routes.SETTINGS)
            navController.navigateSingleTop(Routes.SETTINGS)
            """.trimIndent(),
        )

        assertThat(found.map { it.line }).containsExactly(3, 6, 9).inOrder()
    }

    @Test
    fun `la regle compte les retours nus, pas ceux qui visent une route`() {
        val found = barePops(
            """
            navController.popBackStack()
            navController.popBackStack(Routes.FEED, inclusive = false)
            navController.popFrom(entry)
            """.trimIndent(),
        )

        assertThat(found.map { it.line }).containsExactly(1)
    }

    @Test
    fun `navigateUp sans argument est un retour nu comme popBackStack`() {
        val found = barePops(
            """
            navController.navigateUp()
            navController.popFrom(entry)
            """.trimIndent(),
        )

        assertThat(found.map { it.line }).containsExactly(1)
    }

    @Test
    fun `le nombre de poussees nues ne monte jamais`() {
        val found = navigations()

        assertWithMessage(
            "Une poussee nue a ete ajoutee (${found.size} > $NAVIGATE_CEILING). Un bouton pousse par pushFrom(entry, …) ou " +
                "AppNavigator.navigateFrom ; un evenement par navigateSingleTop. Ne jamais relever le plafond. Sites :\n" +
                found.joinToString("\n") { "${it.file}:${it.line}" },
        ).that(found.size).isAtMost(NAVIGATE_CEILING)
    }

    @Test
    fun `le nombre de retours nus ne monte jamais`() {
        val found = pops()

        assertWithMessage(
            "Un popBackStack() ou un navigateUp() nu a ete ajoute (${found.size} > $POP_CEILING). Un retour passe par popFrom(entry) ou " +
                "closeSheet(entry). Sites :\n" + found.joinToString("\n") { "${it.file}:${it.line}" },
        ).that(found.size).isAtMost(POP_CEILING)
    }

    private companion object {
        /** 190 le 2026-11-14 (4afe432feb), 11 après #18365 : RootFloatingChrome, DeepLinkDispatcher, CallLinkHost, BannerPeekHost, ProfileSheetHost. Abaisser, jamais relever. */
        const val NAVIGATE_CEILING = 11

        /** 49 le 2026-11-14 (4afe432feb), 0 après #18365 : le plafond vaut interdiction. */
        const val POP_CEILING = 0
    }
}
