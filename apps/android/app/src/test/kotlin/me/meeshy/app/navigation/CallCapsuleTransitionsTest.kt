package me.meeshy.app.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.ui.graphics.TransformOrigin
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #18218 — S1.7, S2.1, P18.4, P18.8 : l'appel se contracte VERS la capsule posée en haut de l'application et se
 * redéploie DEPUIS elle (iOS `CallView` : `scaleEffect(1 − 0,9 · progrès, anchor: .top)`), jamais vers le centre.
 * « Réduire les animations » ne garde que le fondu court. Sans capsule (premier appel, appel terminé), l'écran garde
 * son entrée et sa sortie courtes au centre.
 */
class CallCapsuleTransitionsTest {

    private val top = TransformOrigin(0.5f, 0f)

    @Test
    fun `S1-7 - l'appel qui se reduit se contracte vers la capsule, en haut au centre`() {
        assertThat(CallCapsuleTransitions.windowExit(reduceMotion = false, capsuleLive = true))
            .isEqualTo(fadeOut(tween(180)) + scaleOut(tween(180), targetScale = 0.1f, transformOrigin = top))
    }

    @Test
    fun `S2-1 et P18-4 - toucher la capsule redeploie l'appel depuis elle`() {
        assertThat(CallCapsuleTransitions.windowEnter(reduceMotion = false, capsuleLive = true))
            .isEqualTo(fadeIn(tween(220)) + scaleIn(tween(220), initialScale = 0.1f, transformOrigin = top))
    }

    @Test
    fun `P18-8 - sous reduire les animations, contraction et deploiement ne sont qu'un fondu court`() {
        listOf(true, false).forEach { capsuleLive ->
            assertThat(CallCapsuleTransitions.windowEnter(reduceMotion = true, capsuleLive = capsuleLive)).isEqualTo(fadeIn(tween(120)))
            assertThat(CallCapsuleTransitions.windowExit(reduceMotion = true, capsuleLive = capsuleLive)).isEqualTo(fadeOut(tween(120)))
        }
    }

    @Test
    fun `sans capsule, l'ecran d'appel garde son fondu et son echelle 0,92 au centre`() {
        assertThat(CallCapsuleTransitions.windowEnter(reduceMotion = false, capsuleLive = false))
            .isEqualTo(fadeIn(tween(220)) + scaleIn(tween(220), initialScale = 0.92f))
        assertThat(CallCapsuleTransitions.windowExit(reduceMotion = false, capsuleLive = false))
            .isEqualTo(fadeOut(tween(180)) + scaleOut(tween(180), targetScale = 0.92f))
    }

    @Test
    fun `la capsule elle-meme garde son apparition courte, fondu et echelle 0,92`() {
        assertThat(CallCapsuleTransitions.enter(reduceMotion = false)).isEqualTo(fadeIn(tween(220)) + scaleIn(tween(220), initialScale = 0.92f))
        assertThat(CallCapsuleTransitions.exit(reduceMotion = false)).isEqualTo(fadeOut(tween(180)) + scaleOut(tween(180), targetScale = 0.92f))
        assertThat(CallCapsuleTransitions.enter(reduceMotion = true)).isEqualTo(fadeIn(tween(120)))
    }

    private fun source(name: String): String = File("src/main/kotlin/me/meeshy/app/navigation/$name").readText()
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    @Test
    fun `la navigation pose l'ecran d'appel par le mouvement de la fenetre, qui sait si la capsule est la`() {
        val stack = source("StackTransitions.kt")
        assertWithMessage("L'entrée de l'appel se redéploie depuis la capsule")
            .that(stack).contains("CallCapsuleTransitions.windowEnter(reduceMotion, capsuleLive)")
        assertWithMessage("La sortie et le retour de l'appel se contractent vers la capsule")
            .that(Regex("""CallCapsuleTransitions\.windowExit\(reduceMotion, capsuleLive\)""").findAll(stack).count()).isEqualTo(2)
        assertWithMessage("L'écran d'appel ne prend plus l'apparition de la capsule")
            .that(Regex("""CallCapsuleTransitions\.(enter|exit)\(""").findAll(stack).count()).isEqualTo(0)
    }

    @Test
    fun `l'hote de la capsule tient a jour, pour la navigation, si un appel vivant a sa capsule`() {
        val host = source("MinimizedCallPillHost.kt")
        assertThat(host).contains("CallPillPresenter.isMinimizable")
        assertThat(host).contains("CallCapsuleTransitions.capsuleLive =")
    }
}
