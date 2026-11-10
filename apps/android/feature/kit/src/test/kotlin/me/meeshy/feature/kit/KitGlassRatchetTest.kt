package me.meeshy.feature.kit

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Le cliquet du verre (K00, fiche §8) : hors du kit (`component/kit/`), un verre dessiné à la main ne s'ajoute plus. Le
 * verre a UNE entrée (K01) ; chaque lot d'intégration retire des appels et ABAISSE les plafonds dans le même commit. Ils
 * ne montent jamais.
 *
 * Ce qui est compté, dans les sources `src/main` (commentaires et déclarations exclus) : les appels aux entrées du verre
 * dessiné — `MeeshyGlassSurface`, et la recette parallèle du composeur (`meeshyComposerGlass`, son alias
 * `composerInnerGlass`, et les reflets `liquidGlassRim` / `liquidGlassSheen` posés à la main) —, dont ceux dont les
 * arguments nomment `CircleShape` (les boutons ronds). Seule la RECETTE est exemptée (`MeeshyGlassSurface.kt`,
 * `LiquidGlassRecipe.kt`, les jetons de `MeeshyGradients.kt`), comme iOS n'exempte que `MeeshyUI/Compatibility/` : un
 * bouton de verre ajouté dans `chrome/` est un bouton de verre comme un autre.
 *
 * Le plafond est la mesure de la garde au jour où elle est écrite (2026-11-10, `dev` fusionné) : 70 appels dans 53
 * fichiers, dont 23 ronds.
 */
class KitGlassRatchetTest {

    internal data class Call(val file: String, val line: Int, val isRound: Boolean)

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")
    private val call = Regex("""(?<!\w)(MeeshyGlassSurface|meeshyComposerGlass|composerInnerGlass|liquidGlassRim|liquidGlassSheen)\(""")
    private val declaration = Regex("""\bfun\s+(\w+\.)?$""")
    private val skippedDirectories = setOf("build", ".gradle", ".git", ".idea", "node_modules")
    private val recipe = listOf(
        "/component/chrome/MeeshyGlassSurface.kt",
        "/component/chrome/LiquidGlassRecipe.kt",
        "/theme/MeeshyGradients.kt",
    )

    internal fun callsIn(source: String, file: String = "demo/Screen.kt"): List<Call> {
        val clean = source.lines().joinToString("\n") { if (commentLine.containsMatchIn(it)) "" else it }
        return call.findAll(clean)
            .filterNot { declaration.containsMatchIn(clean.substring(maxOf(0, it.range.first - 60), it.range.first)) }
            .map { match ->
                val end = argumentsEnd(clean, match.range.last + 1)
                Call(file, clean.substring(0, match.range.first).count { it == '\n' } + 1, "CircleShape" in clean.substring(match.range.last + 1, end))
            }
            .toList()
    }

    internal fun isOutsideTheKit(path: String): Boolean =
        "/component/kit/" !in path && recipe.none { path.endsWith(it) }

    private fun argumentsEnd(text: String, from: Int): Int {
        var depth = 1
        var index = from
        while (depth > 0 && index < text.length) {
            depth += when (text[index]) {
                '(' -> 1
                ')' -> -1
                else -> 0
            }
            index++
        }
        return index
    }

    private fun mainSources(): List<File> =
        KitRepository.androidRoot.walkTopDown()
            .onEnter { it.name !in skippedDirectories }
            .filter { it.isFile && it.extension == "kt" }
            .filter { "/src/main/" in it.path.replace(File.separatorChar, '/') }
            .toList()

    private fun outsideTheKit(): List<Call> =
        mainSources()
            .filter { isOutsideTheKit(it.path.replace(File.separatorChar, '/')) }
            .flatMap { callsIn(it.readText(), it.relativeTo(KitRepository.androidRoot).path.replace(File.separatorChar, '/')) }

    @Test
    fun `l'analyse voit les sources - sinon la garde passerait en ne lisant rien`() {
        assertThat(mainSources().size).isAtLeast(300)
        assertThat(outsideTheKit()).isNotEmpty()
    }

    @Test
    fun `la regle reconnait un appel, un appel rond, et ignore la declaration et les commentaires`() {
        val found = callsIn(
            """
            // MeeshyGlassSurface( dans un commentaire
            /** MeeshyGlassSurface( dans une doc */
            fun MeeshyGlassSurface(modifier: Modifier) {}
            MeeshyGlassSurface(shape = RoundedCornerShape(8.dp)) { }
            MeeshyGlassSurface(
                modifier = Modifier.size(44.dp),
                shape = CircleShape,
            ) { }
            """.trimIndent(),
        )

        assertThat(found.map { it.isRound }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `la recette parallele du composeur et ses alias comptent aussi`() {
        val found = callsIn(
            """
            public fun Modifier.meeshyComposerGlass(shape: Shape, tint: Color? = null): Modifier =
                border(1.dp, MeeshyGradients.liquidGlassRim(dark, false), shape)
            internal fun Modifier.composerInnerGlass(shape: Shape): Modifier = meeshyComposerGlass(shape)
            Box(Modifier.size(44.dp).composerInnerGlass(CircleShape))
            Box(Modifier.meeshyComposerGlass(RoundedCornerShape(MeeshyRadius.lg)))
            """.trimIndent(),
        )

        assertThat(found.map { it.line to it.isRound })
            .containsExactly(2 to false, 3 to false, 4 to true, 5 to false).inOrder()
    }

    @Test
    fun `seule la recette est exemptee, pas le reste de chrome`() {
        val ui = "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui"

        assertThat(isOutsideTheKit("$ui/component/chrome/MeeshyGlassSurface.kt")).isFalse()
        assertThat(isOutsideTheKit("$ui/component/chrome/LiquidGlassRecipe.kt")).isFalse()
        assertThat(isOutsideTheKit("$ui/component/kit/MeeshyGlassButton.kt")).isFalse()
        assertThat(isOutsideTheKit("$ui/component/chrome/MeeshySheetHeader.kt")).isTrue()
        assertThat(isOutsideTheKit("$ui/component/message/MessageComposerGlass.kt")).isTrue()
    }

    @Test
    fun `le nombre d'appels au verre dessine a la main ne monte jamais`() {
        val found = outsideTheKit()

        assertWithMessage(
            "Un verre a ete dessine a la main hors du kit (${found.size} > $CALLS_CEILING). Le verre passe par K01 : utiliser le " +
                "composant du kit, jamais relever le plafond. Appels :\n" + found.joinToString("\n") { "${it.file}:${it.line}" },
        ).that(found.size).isAtMost(CALLS_CEILING)
    }

    @Test
    fun `le nombre de boutons ronds de verre dessines a la main ne monte jamais`() {
        val round = outsideTheKit().filter { it.isRound }

        assertWithMessage(
            "Un bouton rond de verre a ete ajoute hors du kit (${round.size} > $ROUND_CEILING). Appels :\n" +
                round.joinToString("\n") { "${it.file}:${it.line}" },
        ).that(round.size).isAtMost(ROUND_CEILING)
    }

    private companion object {
        /** Mesuré sur `dev` fusionné le 2026-11-10 (70 appels dans 53 fichiers). Abaisser, jamais relever. */
        const val CALLS_CEILING = 70

        /** Mesuré sur `dev` fusionné le 2026-11-10. Abaisser, jamais relever. */
        const val ROUND_CEILING = 23
    }
}
