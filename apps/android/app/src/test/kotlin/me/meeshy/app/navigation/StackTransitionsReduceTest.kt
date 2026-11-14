package me.meeshy.app.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #18387 — sous « Réduire les animations », un écran poussé s'ouvre et se referme en fondu court (150 ms, iOS
 * `MeeshyMotion.reducedFade`) : aucune page ne glisse sur la largeur. Hors réduction, la poussée reste celle d'iOS.
 */
class StackTransitionsReduceTest {

    private val slideIn = slideInHorizontally(tween(280)) { it / 4 }
    private val slideOut = slideOutHorizontally(tween(280)) { it / 3 }

    @Test
    fun `sous reduction l'entree empilee est le fondu court et le glissement n'est jamais construit`() {
        var built = false
        val enter = stackedEnter(reduce = true) { built = true; slideIn }
        assertThat(enter).isEqualTo(fadeIn(tween(150)))
        assertThat(built).isFalse()
    }

    @Test
    fun `sous reduction la sortie empilee est le fondu court et le glissement n'est jamais construit`() {
        var built = false
        val exit = stackedExit(reduce = true) { built = true; slideOut }
        assertThat(exit).isEqualTo(fadeOut(tween(150)))
        assertThat(built).isFalse()
    }

    @Test
    fun `hors reduction la pile glisse comme iOS`() {
        assertThat(stackedEnter(reduce = false) { slideIn }).isSameInstanceAs(slideIn)
        assertThat(stackedExit(reduce = false) { slideOut }).isSameInstanceAs(slideOut)
    }

    private val source: String = File("src/main/kotlin/me/meeshy/app/navigation/StackTransitions.kt").readText()
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    private val slides = Regex("""\bslide(IntoContainer|OutOfContainer)\s*\(""")
    private val reducedSlides = Regex("""\bstacked(Enter|Exit)\(\s*reduceMotion\s*\)\s*\{\s*slide(IntoContainer|OutOfContainer)\s*\(""")

    @Test
    fun `la pile ne glisse que dans la lambda des aides reduites`() {
        val all = slides.findAll(source).count()
        val reduced = reducedSlides.findAll(source).count()
        assertWithMessage("Glissement(s) de pile hors de stackedEnter/stackedExit(reduceMotion) : ${all - reduced}")
            .that(all - reduced).isEqualTo(0)
        assertWithMessage("Les quatre branches empilées (poussée, dessous, retour, départ) passent par les aides réduites")
            .that(reduced).isEqualTo(4)
    }

    @Test
    fun `le glisse de bord lit le reglage de l'app et revient sur un ressort MeeshyMotion`() {
        val host = File("src/main/kotlin/me/meeshy/app/navigation/EdgeSwipeBackHost.kt").readText()
        assertThat(host).contains("LocalReduceMotion")
        assertThat(host).contains("MeeshyMotion.springFast")
        assertThat(host).doesNotContain("Spring.Stiffness")
        assertThat(host).doesNotContain("ANIMATOR_DURATION_SCALE")
    }
}
