package me.meeshy.ui.component.kit

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K15 — la feuille ancrée rendue : ce que le lecteur d'écran lit, ce que le doigt déclenche, la place publiée, et que rien
 * ne se rend feuille fermée. Miroir des témoins de comportement de `MeeshyAnchoredSheetTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-mdpi")
class MeeshyAnchoredSheetBehaviorTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun show(reduceMotion: Boolean = true, content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion) { content() }
            }
        }
        compose.waitForIdle()
    }

    /** La hauteur de la fenêtre du test, en dp : les fractions de la feuille se comptent sur elle, quel que soit l'écran simulé. */
    private val window: Float
        get() = compose.onRoot().getUnclippedBoundsInRoot().height.value

    @Composable
    private fun Rows(count: Int = 4) {
        Box(Modifier.size(width = 200.dp, height = (count * 48).dp).testTag(ROWS))
    }

    // region Le nom, le role et ce qu'on voit

    @Test
    fun `le titre est annonce comme titre et nomme la fenetre`() {
        show { MeeshyAnchoredSheet(onDismissRequest = {}, title = "Plus", closeLabel = "Fermer") { Rows() } }

        compose.onNodeWithText("Plus").assertIsDisplayed()
        assertThat(compose.onNodeWithText("Plus").fetchSemanticsNode().config.contains(SemanticsProperties.Heading)).isTrue()
        assertThat(compose.onNodeWithTag(MeeshyAnchoredSheetTags.SHEET).fetchSemanticsNode().config[SemanticsProperties.PaneTitle])
            .isEqualTo("Plus")
    }

    @Test
    fun `sans titre, le nom est l'etiquette d'accessibilite`() {
        show { MeeshyAnchoredSheet(onDismissRequest = {}, accessibilityLabel = "Options") { Rows() } }

        val config = compose.onNodeWithTag(MeeshyAnchoredSheetTags.SHEET).fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.PaneTitle]).isEqualTo("Options")
        assertThat(config[SemanticsProperties.ContentDescription]).containsExactly("Options")
    }

    @Test
    fun `la loi 13 - ni poignee, ni croix, ni rangee hors de leurs conditions`() {
        show {
            MeeshyAnchoredSheet(
                onDismissRequest = {},
                accessibilityLabel = "Options",
                showsHandle = false,
                closeLabel = "Fermer",
            ) { Rows() }
        }

        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HANDLE).assertDoesNotExist()
        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HEADER).assertDoesNotExist()
        compose.onNodeWithContentDescription("Fermer").assertDoesNotExist()
    }

    @Test
    fun `la fin d'en-tete remplace la croix`() {
        show {
            MeeshyAnchoredSheet(
                onDismissRequest = {},
                title = "pop-2024.m4a",
                closeLabel = "Fermer",
                trailing = { Text("OK") },
            ) { Rows() }
        }

        compose.onNodeWithText("OK").assertIsDisplayed()
        compose.onNodeWithContentDescription("Fermer").assertDoesNotExist()
    }

    @Test
    fun `sans nom de fermeture, pas de croix`() {
        show { MeeshyAnchoredSheet(onDismissRequest = {}, title = "Plus", closeLabel = null) { Rows() } }

        compose.onNodeWithText("Plus").assertIsDisplayed()
        compose.onNode(hasContentDescription("Fermer")).assertDoesNotExist()
    }

    // endregion

    // region La fermeture

    @Test
    fun `la croix ferme, une seule fois`() {
        var dismissed = 0
        show { MeeshyAnchoredSheet(onDismissRequest = { dismissed++ }, title = "Plus", closeLabel = "Fermer") { Rows() } }

        compose.onNodeWithContentDescription("Fermer").performClick()
        compose.waitForIdle()

        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `un toucher hors de la feuille la ferme, et la zone est un bouton nomme`() {
        var dismissed = 0
        show { MeeshyAnchoredSheet(onDismissRequest = { dismissed++ }, title = "Plus", closeLabel = "Fermer") { Rows() } }

        compose.onNodeWithContentDescription(OUTSIDE).performClick()
        compose.waitForIdle()

        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `en PassesThrough, rien hors de la feuille ne l'intercepte`() {
        var dismissed = 0
        show {
            MeeshyAnchoredSheet(
                onDismissRequest = { dismissed++ },
                title = "Plus",
                outside = MeeshyAnchoredSheetOutside.PassesThrough,
                closeLabel = "Fermer",
            ) { Rows() }
        }

        compose.onNodeWithContentDescription(OUTSIDE).assertDoesNotExist()
        assertThat(dismissed).isEqualTo(0)
    }

    @Test
    fun `le retour materiel ferme une feuille modale, pas une feuille qui laisse passer`() {
        var dismissed = 0
        var passes by mutableStateOf(false)
        show {
            MeeshyAnchoredSheet(
                onDismissRequest = { dismissed++ },
                title = "Plus",
                outside = if (passes) MeeshyAnchoredSheetOutside.PassesThrough else MeeshyAnchoredSheetOutside.Dismisses,
            ) { Rows() }
        }

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(1)

        passes = true
        compose.waitForIdle()
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `un glisse court revient, un glisse long ferme`() {
        var dismissed = 0
        show { MeeshyAnchoredSheet(onDismissRequest = { dismissed++ }, title = "Plus", height = MeeshyAnchoredSheetHeight.Regular) { Rows() } }

        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HEADER).performTouchInput { swipeDown(startY = centerY, endY = centerY + 12f, durationMillis = 800) }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(0)

        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HEADER).performTouchInput { swipeDown(startY = centerY, endY = centerY + 260f, durationMillis = 120) }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `sans glisse, la feuille ne se ferme pas au doigt et n'a pas de poignee`() {
        var dismissed = 0
        show {
            MeeshyAnchoredSheet(
                onDismissRequest = { dismissed++ },
                title = "Plus",
                height = MeeshyAnchoredSheetHeight.Regular,
                isDragDismissEnabled = false,
                closeLabel = "Fermer",
            ) { Rows() }
        }

        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HANDLE).assertDoesNotExist()
        compose.onNodeWithTag(MeeshyAnchoredSheetTags.HEADER).performTouchInput { swipeDown(startY = centerY, endY = centerY + 260f, durationMillis = 120) }
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(0)
    }

    // endregion

    // region La place publiee

    @Test
    fun `la place publiee est la hauteur de la feuille au repos`() {
        lateinit var state: MeeshyAnchoredSheetState
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheet(onDismissRequest = {}, title = "Stickers", height = MeeshyAnchoredSheetHeight.Regular, state = state) { Rows() }
        }

        assertThat(state.footprintPx).isWithin(1f).of(window * 0.5f)
        compose.onNodeWithTag(MeeshyAnchoredSheetTags.SHEET).assertHeightIsEqualTo((window * 0.5f).dp)
    }

    @Test
    fun `une feuille a la hauteur du contenu publie sa place une fois mesuree, plafonnee`() {
        lateinit var state: MeeshyAnchoredSheetState
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheetHost(open = "a", onDismissRequest = {}, title = "Long", state = state) {
                Box(Modifier.fillMaxSize().height(2_000.dp))
            }
        }

        assertThat(state.footprintPx).isWithin(1f).of(window * 0.62f)
    }

    @Test
    fun `fermee, la feuille ne rend rien et ne publie aucune place`() {
        lateinit var state: MeeshyAnchoredSheetState
        var open by mutableStateOf<String?>("a")
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheetHost(open = open, onDismissRequest = {}, title = "Plus", height = MeeshyAnchoredSheetHeight.Regular, state = state) { Rows() }
        }
        assertThat(state.footprintPx).isGreaterThan(0f)

        open = null
        compose.waitForIdle()

        assertThat(state.footprintPx).isEqualTo(0f)
        compose.onNodeWithTag(MeeshyAnchoredSheetTags.SHEET).assertDoesNotExist()
    }

    @Test
    fun `une feuille remplacee par une autre rend sa place a l'hote sans trou`() {
        lateinit var state: MeeshyAnchoredSheetState
        var open by mutableStateOf("a")
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheetHost(open = open, onDismissRequest = {}, title = "Plus", height = MeeshyAnchoredSheetHeight.Regular, state = state) { Rows() }
        }

        open = "b"
        compose.waitForIdle()

        assertThat(state.footprintPx).isWithin(1f).of(window * 0.5f)
    }

    @Test
    fun `la place d'une feuille systeme se publie sans rien dessiner`() {
        lateinit var state: MeeshyAnchoredSheetState
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheetPlaceholder(height = MeeshyAnchoredSheetHeight.Regular, state = state)
        }

        assertThat(state.footprintPx).isWithin(1f).of(window * 0.5f)
        compose.onNodeWithTag(MeeshyAnchoredSheetTags.SHEET).assertDoesNotExist()
    }

    @Test
    fun `la place est dans la fenetre du test - la densite est celle d'un ecran mdpi`() {
        var density = 0f
        show {
            density = LocalDensity.current.density
            Box(Modifier.fillMaxSize().background(Color.Transparent))
        }

        assertThat(density).isEqualTo(1f)
    }

    // endregion

    // region Les crans

    @Test
    fun `une feuille a crans a une poignee reglable, nommee, dont la valeur suit le cran`() {
        lateinit var state: MeeshyAnchoredSheetState
        show {
            state = rememberMeeshyAnchoredSheetState()
            MeeshyAnchoredSheetHeight.Detents(listOf(0.3f, 0.62f), initial = 0).let { height ->
                MeeshyAnchoredSheet(onDismissRequest = {}, title = "Stickers", height = height, state = state) { Rows() }
            }
        }

        val handle = compose.onNodeWithTag(MeeshyAnchoredSheetTags.HANDLE)
        handle.assertExists()
        assertThat(handle.fetchSemanticsNode().config[SemanticsProperties.ContentDescription]).containsExactly("Sheet height")
        assertThat(handle.fetchSemanticsNode().config[SemanticsProperties.StateDescription]).isEqualTo("collapsed")
        assertThat(state.footprintPx).isWithin(1f).of(window * 0.3f)

        val increase = handle.fetchSemanticsNode().config[SemanticsActions.CustomActions].first { it.label == "Increase" }
        compose.runOnUiThread { increase.action() }
        compose.waitForIdle()

        assertThat(state.detentIndex).isEqualTo(1)
        assertThat(state.footprintPx).isWithin(1f).of(window * 0.62f)
        assertThat(
            compose.onNodeWithTag(MeeshyAnchoredSheetTags.HANDLE).fetchSemanticsNode().config[SemanticsProperties.StateDescription],
        ).isEqualTo("expanded")
    }

    @Test
    fun `sans cran, la poignee n'est pas un controle`() {
        show { MeeshyAnchoredSheet(onDismissRequest = {}, title = "Plus", height = MeeshyAnchoredSheetHeight.Regular) { Rows() } }

        val config = compose.onNodeWithTag(MeeshyAnchoredSheetTags.HANDLE).fetchSemanticsNode().config
        assertThat(config.contains(SemanticsActions.CustomActions)).isFalse()
    }

    // endregion

    private companion object {
        const val ROWS = "rows"
        const val OUTSIDE = "Close the sheet"
    }
}
