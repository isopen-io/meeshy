package me.meeshy.ui.component.kit

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.feedback.HapticSink
import me.meeshy.sdk.feedback.HapticSurfacing
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K14 — la FACE de la capsule de statut : ce qui se rend (message, détail, icône, action, ✕), ce qui ne se rend jamais sans
 * son paramètre, les gestes (action, ✕, glisser), les noms et les rôles du lecteur d'écran, la disposition en grande police
 * et en RTL. La loi et la recette se lisent dans `MeeshyStatusCapsuleLawTest`, l'hôte dans `MeeshyStatusCapsuleHostTest`.
 * Miroir de `MeeshyStatusCapsuleTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyStatusCapsuleTest {

    @get:Rule
    val compose = createComposeRule()

    private class Recorder : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) {
            received += feedbackConstant
        }
    }

    private fun haptics(recorder: Recorder) = MeeshyHaptics(HapticSurfacing(recorder, 35))

    private fun show(
        direction: LayoutDirection = LayoutDirection.Ltr,
        fontScale: Float = 1f,
        content: @Composable () -> Unit,
    ) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalLayoutDirection provides direction,
                LocalDensity provides Density(density.density, fontScale = fontScale),
            ) {
                MeeshyTheme(darkTheme = false) { content() }
            }
        }
        compose.waitForIdle()
    }

    // region Ce qui se rend

    @Test
    fun `un message vide ne rend rien`() {
        show { MeeshyStatusCapsule(message = "  ", modifier = Modifier.testTag(TAG)) }

        compose.onNodeWithTag(TAG).assertDoesNotExist()
    }

    @Test
    fun `le texte se lit message puis detail, en region vivante polie`() {
        show { MeeshyStatusCapsule(message = "Limite atteinte", detail = "Supprimez-en une") }

        compose.onNodeWithContentDescription("Limite atteinte, Supprimez-en une")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun `un echec s'annonce en priorite, region vivante assertive`() {
        show { MeeshyStatusCapsule(message = "Non publié", kind = MeeshyStatusCapsuleKind.Failure) }

        compose.onNodeWithContentDescription("Non publié")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Assertive))
    }

    @Test
    fun `un detail vide n'existe pas, le nom ne garde que le message`() {
        show { MeeshyStatusCapsule(message = "Limite atteinte", detail = "   ") }

        compose.onNodeWithContentDescription("Limite atteinte").assertIsDisplayed()
    }

    @Test
    fun `ni action, ni croix, ni fermeture sans leur parametre, et le toucher traverse`() {
        show { MeeshyStatusCapsule(message = "Limite atteinte", icon = MeeshyIcons.WifiOff) }

        compose.onAllNodes(hasClickAction()).assertCountEquals(0)
    }

    @Test
    fun `la croix ne se dessine qu'avec son nom ET sa fermeture`() {
        show { MeeshyStatusCapsule(message = "Un", closeLabel = "Fermer", modifier = Modifier.testTag("sans-fermeture")) }
        compose.onNodeWithContentDescription("Fermer").assertDoesNotExist()
        compose.onNodeWithTag("sans-fermeture").assertIsDisplayed()
    }

    @Test
    fun `la croix se dessine avec son nom et sa fermeture, et ferme`() {
        var closed = 0
        show { MeeshyStatusCapsule(message = "Brouillon", closeLabel = "Fermer", onDismiss = { closed++ }) }

        compose.onNodeWithContentDescription("Fermer").assertHasClickAction().performClick()

        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `une capsule qui se ferme porte l'action Fermer du lecteur d'ecran`() {
        show { MeeshyStatusCapsule(message = "Brouillon", onDismiss = { }, modifier = Modifier.testTag(TAG)) }

        val actions = compose.onNodeWithTag(TAG).fetchSemanticsNode().config.getOrNull(SemanticsActions.CustomActions)
        assertThat(actions).hasSize(1)
        assertThat(actions!!.single().label).isEqualTo("Close")
    }

    @Test
    fun `sans fermeture, aucune action personnalisee`() {
        show { MeeshyStatusCapsule(message = "Brouillon", modifier = Modifier.testTag(TAG)) }

        val actions = compose.onNodeWithTag(TAG).fetchSemanticsNode().config.getOrNull(SemanticsActions.CustomActions)

        assertThat(actions).isNull()
    }

    // endregion

    // region L'action

    @Test
    fun `l'action est un bouton nomme par son libelle, part une fois au relacher, avec un retour leger`() {
        var performed = 0
        val recorder = Recorder()
        show {
            MeeshyStatusCapsule(
                message = "Non publié",
                action = MeeshyStatusCapsuleAction(label = "Réessayer", icon = MeeshyIcons.Refresh) { performed++ },
                haptics = haptics(recorder),
            )
        }

        compose.onNodeWithText("Réessayer")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()

        assertThat(performed).isEqualTo(1)
        assertThat(recorder.received).containsExactly(HapticSurfacing.constantFor(HapticKind.LIGHT, 35))
    }

    @Test
    fun `l'action se dessine en 36 dp`() {
        show { MeeshyStatusCapsule(message = "Non publié", action = MeeshyStatusCapsuleAction("Réessayer") { }) }

        compose.onNodeWithText("Réessayer").assertHeightIsEqualTo(MeeshyControlSize.regular)
    }

    @Test
    fun `la face ne vibre jamais a l'apparition`() {
        val recorder = Recorder()
        show { MeeshyStatusCapsule(message = "Non publié", kind = MeeshyStatusCapsuleKind.Failure, haptics = haptics(recorder)) }

        assertThat(recorder.received).isEmpty()
    }

    // endregion

    // region Le glisser

    @Test
    fun `glisser de 40 dp vers son bord ferme, une fois`() {
        var closed = 0
        show { MeeshyStatusCapsule(message = "Brouillon", onDismiss = { closed++ }, modifier = Modifier.testTag(TAG)) }

        compose.onNodeWithTag(TAG).performTouchInput { swipe(start = center, end = Offset(center.x, center.y + 40.dp.toPx())) }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `glisser de 10 dp seulement ne ferme pas, elle revient`() {
        var closed = 0
        show { MeeshyStatusCapsule(message = "Brouillon", onDismiss = { closed++ }, modifier = Modifier.testTag(TAG)) }

        compose.onNodeWithTag(TAG).performTouchInput { swipe(start = center, end = Offset(center.x, center.y + 10.dp.toPx())) }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(0)
    }

    @Test
    fun `glisser vers l'autre bord ne ferme pas`() {
        var closed = 0
        show { MeeshyStatusCapsule(message = "Brouillon", onDismiss = { closed++ }, modifier = Modifier.testTag(TAG)) }

        compose.onNodeWithTag(TAG).performTouchInput { swipe(start = center, end = Offset(center.x, center.y - 60.dp.toPx())) }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(0)
    }

    @Test
    fun `depuis le bord haut, c'est vers le haut qu'elle se ferme`() {
        var closed = 0
        show {
            MeeshyStatusCapsule(
                message = "Brouillon",
                onDismiss = { closed++ },
                edge = MeeshyStatusCapsuleEdge.Top,
                modifier = Modifier.testTag(TAG),
            )
        }

        compose.onNodeWithTag(TAG).performTouchInput { swipe(start = center, end = Offset(center.x, center.y - 40.dp.toPx())) }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `sans fermeture, glisser ne ferme rien`() {
        show { MeeshyStatusCapsule(message = "Brouillon", modifier = Modifier.testTag(TAG)) }

        compose.onNodeWithTag(TAG).performTouchInput { swipe(start = center, end = Offset(center.x, center.y + 60.dp.toPx())) }
        compose.waitForIdle()

        compose.onNodeWithTag(TAG).assertIsDisplayed()
    }

    // endregion

    // region La disposition

    @Test
    fun `largeur de 350 dp au plus, un message long passe a la ligne`() {
        show {
            MeeshyStatusCapsule(
                message = "Dix scènes au maximum — supprimez-en une pour en créer une autre, et encore un peu plus de texte",
                modifier = Modifier.testTag(TAG),
            )
        }

        val width = with(compose.density) { compose.onNodeWithTag(TAG).fetchSemanticsNode().size.width.toDp() }

        assertThat(width.value).isAtMost(350f + 0.5f)
    }

    @Test
    fun `a taille normale, l'action est sur la ligne du texte`() {
        show { MeeshyStatusCapsule(message = "Non publié", action = MeeshyStatusCapsuleAction("Réessayer") { }) }

        val text = compose.onNodeWithContentDescription("Non publié").fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithText("Réessayer").fetchSemanticsNode().boundsInRoot

        assertThat(action.top).isLessThan(text.bottom)
        assertThat(action.left).isAtLeast(text.right - 0.5f)
    }

    @Test
    fun `en grande police, l'action passe sous le texte`() {
        show(fontScale = 2f) { MeeshyStatusCapsule(message = "Non publié", action = MeeshyStatusCapsuleAction("Réessayer") { }) }

        val text = compose.onNodeWithContentDescription("Non publié").fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithText("Réessayer").fetchSemanticsNode().boundsInRoot

        assertThat(action.top).isAtLeast(text.bottom - 0.5f)
    }

    @Test
    fun `en RTL, l'action est a la fin, donc a gauche du texte`() {
        show(direction = LayoutDirection.Rtl) { MeeshyStatusCapsule(message = "Non publié", action = MeeshyStatusCapsuleAction("Réessayer") { }) }

        val text = compose.onNodeWithContentDescription("Non publié").fetchSemanticsNode().boundsInRoot
        val action = compose.onNodeWithText("Réessayer").fetchSemanticsNode().boundsInRoot

        assertThat(action.right).isAtMost(text.left + 0.5f)
    }

    // endregion

    private companion object {
        const val TAG = "capsule"
    }
}
