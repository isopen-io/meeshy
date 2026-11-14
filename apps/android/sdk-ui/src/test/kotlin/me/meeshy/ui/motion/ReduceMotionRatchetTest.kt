package me.meeshy.ui.motion

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Cliquet de « Réduire les animations » (#18459). Lit tous les `src/main` Android, commentaires retirés, hors de
 * `sdk-ui/.../motion/`, de `theme/MeeshyMotion.kt` et des dossiers `accessibility/` — les lieux qui DÉFINISSENT le
 * mouvement et sa réduction.
 *
 * (1) `motion-sans-reduction` : un glissement, une échelle, un dépliage, une boucle infinie ou une taille animée
 * (l'appel suivi de sa parenthèse ou de son lambda de fin, `slideInVertically { it }`) dans un fichier qui ne lit
 * jamais la réduction (ni `LocalReduceMotion`, ni `rememberCallReduceMotion`, ni le mot `reduce`).
 * Limite assumée : la règle juge le fichier, pas la branche ; les témoins de comportement tiennent le reste.
 * (2) `echelle-systeme` : `ANIMATOR_DURATION_SCALE` lu en direct, qui ignore le réglage de l'app.
 * (3) `ressort-litteral` : un ressort aux paramètres locaux au lieu des jetons de `MeeshyMotion` ou de `motionSpec`.
 * (4) `tween-litteral` : une durée en chiffres au lieu d'une constante nommée.
 *
 * Les quatre nombres ne font que DESCENDRE : un lot qui migre abaisse le plafond dans le même commit ; un ajout fait
 * rougir ce test et nomme chaque fichier.
 */
class ReduceMotionRatchetTest {

    private val skippedDirectories = setOf("build", ".gradle", ".git", ".idea", "node_modules")

    private val motionPrimitive = Regex(
        """\b(slideIn\w*|slideOut\w*|scaleIn|scaleOut|expandVertically|expandHorizontally|expandIn|shrinkVertically|""" +
            """shrinkHorizontally|shrinkOut|slideIntoContainer|slideOutOfContainer|rememberInfiniteTransition|""" +
            """animateContentSize)(\(|\s*\{)""",
    )
    private val readsReduction = Regex("""LocalReduceMotion|rememberCallReduceMotion|reduce""")
    private val systemScale = Regex("""\bANIMATOR_DURATION_SCALE\b""")
    private val literalSpring = Regex("""\bspring(<[^>()]*>)?\(\s*(dampingRatio|stiffness)|\bSpring\.Stiffness\w+""")
    private val literalTween = Regex("""\btween(<[^>()]*>)?\(\s*\d""")

    private fun androidRoot(): File {
        val start = File("").absoluteFile
        val direct = generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, "settings.gradle.kts").isFile && File(it, "sdk-ui").isDirectory }
        if (direct != null) return direct
        val fromRepository = File(start, "apps/android")
        check(fromRepository.isDirectory) { "racine du projet Android introuvable depuis ${start.absolutePath}" }
        return fromRepository
    }

    private fun File.invariantPath(): String = path.replace(File.separatorChar, '/')

    private fun isMotionHome(path: String): Boolean =
        "/sdk-ui/src/main/kotlin/me/meeshy/ui/motion/" in path ||
            path.endsWith("/theme/MeeshyMotion.kt") ||
            "/accessibility/" in path

    private fun mainSources(): List<File> =
        androidRoot().walkTopDown()
            .onEnter { it.name !in skippedDirectories }
            .filter { it.isFile && it.extension == "kt" }
            .filter { "/src/main/" in it.invariantPath() && !isMotionHome(it.invariantPath()) }
            .toList()

    private fun withoutComments(source: String): String =
        source
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL)) { block -> "\n".repeat(block.value.count { it == '\n' }) }
            .replace(Regex("""//[^\n]*"""), "")

    internal fun unreducedMotionIn(source: String): Int {
        val code = withoutComments(source)
        return if (readsReduction.containsMatchIn(code)) 0 else motionPrimitive.findAll(code).count()
    }

    internal fun systemScaleReadsIn(source: String): Int = systemScale.findAll(withoutComments(source)).count()

    internal fun literalSpringsIn(source: String): Int = literalSpring.findAll(withoutComments(source)).count()

    internal fun literalTweensIn(source: String): Int = literalTween.findAll(withoutComments(source)).count()

    private fun occurrences(count: (String) -> Int): List<String> =
        mainSources().flatMap { file -> List(count(file.readText())) { file.relativeTo(androidRoot()).invariantPath() } }

    private fun assertCeiling(rule: String, found: List<String>, ceiling: Int, remedy: String) {
        assertWithMessage(
            "$rule : ${found.size} > $ceiling. $remedy, jamais relever le plafond. Occurrences :\n" +
                found.groupingBy { it }.eachCount().entries.joinToString("\n") { (file, n) -> "$n  $file" },
        ).that(found.size).isAtMost(ceiling)
    }

    @Test
    fun `the scan sees the sources and skips the motion homes`() {
        val paths = mainSources().map { it.invariantPath() }
        assertThat(paths.size).isAtLeast(300)
        assertThat(paths.any { it.endsWith("/component/chrome/MeeshyFloatingButtons.kt") }).isTrue()
        assertThat(paths.none { it.endsWith("/accessibility/ReduceMotion.kt") }).isTrue()
        assertThat(paths.none { it.endsWith("/motion/ReducedMotionTransitions.kt") }).isTrue()
    }

    @Test
    fun `the rules recognise their pattern and nothing else`() {
        assertThat(unreducedMotionIn("enter = fadeIn() + slideInVertically { it }")).isEqualTo(1)
        assertThat(unreducedMotionIn("val t = rememberInfiniteTransition(label = \"x\")")).isEqualTo(1)
        assertThat(unreducedMotionIn("Modifier.animateContentSize()")).isEqualTo(1)
        assertThat(unreducedMotionIn("import androidx.compose.animation.slideInVertically")).isEqualTo(0)
        assertThat(unreducedMotionIn("val reduce = LocalReduceMotion.current\nslideInVertically { it }")).isEqualTo(0)
        assertThat(unreducedMotionIn("viewModel.expanded(true)\nexpandedState(x)")).isEqualTo(0)
        assertThat(unreducedMotionIn("// slideInVertically(\n/* scaleIn( */")).isEqualTo(0)

        assertThat(systemScaleReadsIn("Settings.Global.ANIMATOR_DURATION_SCALE")).isEqualTo(1)
        assertThat(systemScaleReadsIn("// ANIMATOR_DURATION_SCALE")).isEqualTo(0)

        assertThat(literalSpringsIn("spring(dampingRatio = 0.7f, stiffness = 300f)")).isEqualTo(1)
        assertThat(literalSpringsIn("spring<Float>(stiffness = Spring.StiffnessLow)")).isEqualTo(2)
        assertThat(literalSpringsIn("MeeshyMotion.springFast<Float>()\nspring()")).isEqualTo(0)

        assertThat(literalTweensIn("tween(300)")).isEqualTo(1)
        assertThat(literalTweensIn("tween<Float>( 120, easing = LinearEasing)")).isEqualTo(1)
        assertThat(literalTweensIn("tween(FADE_MILLIS)\ntween(durationMillis = 150)")).isEqualTo(0)
    }

    @Test
    fun `no motion is added in a file that never reads the reduction`() {
        assertCeiling(
            "motion-sans-reduction",
            occurrences(::unreducedMotionIn),
            UNREDUCED_MOTION_CEILING,
            "Lire LocalReduceMotion et passer la transition par meeshyEnter / meeshyExit / meeshySpec",
        )
    }

    @Test
    fun `the system animator scale is never read outside the accessibility locals`() {
        assertCeiling(
            "echelle-systeme",
            occurrences(::systemScaleReadsIn),
            SYSTEM_SCALE_CEILING,
            "Lire LocalReduceMotion, qui resout l'echelle systeme ET le reglage de l'app",
        )
    }

    @Test
    fun `no literal spring is added`() {
        assertCeiling(
            "ressort-litteral",
            occurrences(::literalSpringsIn),
            LITERAL_SPRING_CEILING,
            "Prendre MeeshyMotion.springFast / springDefault / springBouncy ou motionSpec",
        )
    }

    @Test
    fun `no literal tween duration is added`() {
        assertCeiling(
            "tween-litteral",
            occurrences(::literalTweensIn),
            LITERAL_TWEEN_CEILING,
            "Nommer la duree par une constante qui reprend la valeur iOS ou celle de la fiche",
        )
    }

    private companion object {
        /** 117 dans 64 fichiers sur origin/dev le 2026-11-14 avant #18459 ; 104 dans 57 apres. Abaisser, jamais relever. */
        const val UNREDUCED_MOTION_CEILING = 104

        /** 11 le 2026-11-14 sur 4afe432feb, 9 apres le lot des feuilles, 4 apres #18459. Abaisser, jamais relever. */
        const val SYSTEM_SCALE_CEILING = 4

        /** 120 le 2026-11-14 avant #18459, 111 apres. Abaisser, jamais relever. */
        const val LITERAL_SPRING_CEILING = 111

        /** 89 le 2026-11-14 avant #18459, 72 apres. Abaisser, jamais relever. */
        const val LITERAL_TWEEN_CEILING = 72
    }
}
