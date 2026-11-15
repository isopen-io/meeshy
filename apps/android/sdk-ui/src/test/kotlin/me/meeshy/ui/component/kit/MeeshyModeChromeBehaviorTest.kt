package me.meeshy.ui.component.kit

import android.content.Context
import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTouchHeightIsEqualTo
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K16 — le cadre d'un mode plein écran rendu : ce que le lecteur d'écran lit, ce que le doigt et le retour matériel
 * déclenchent, ce que le cadre laisse passer au contenu de l'hôte, et que la plaque ne recompose pas l'en-tête. Miroir des
 * témoins de comportement de `MeeshyModeChromeTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyModeChromeBehaviorTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun word(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun show(width: Int = FRAME_WIDTH, content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.size(width.dp, FRAME_HEIGHT.dp).testTag(FRAME)) { content() }
            }
        }
        compose.waitForIdle()
    }

    private fun exit(onClick: () -> Unit = {}) = MeeshyModeAction(title = "Quitter", onClick = onClick, hint = "Revient à l'état d'avant")

    private fun confirm(
        onClick: () -> Unit = {},
        enabled: Boolean = true,
        busy: Boolean = false,
    ) = MeeshyModeAction(title = "Valider", onClick = onClick, enabled = enabled, busy = busy)

    // region Le nom, le role et la valeur

    @Test
    fun `l'en-tete est un groupe nomme du nom du mode - annonce a l'entree`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit(), confirm = confirm()) }

        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Dessin")).assertExists()
    }

    @Test
    fun `Quitter et Valider sont des boutons qui portent leur titre, et Quitter dit son indice`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit(), confirm = confirm()) }

        listOf("Quitter", "Valider").forEach {
            compose.onNodeWithContentDescription(it)
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
                .assertHasClickAction()
        }
    }

    @Test
    fun `une validation reduite a la coche garde son titre comme nom`() {
        show {
            MeeshyModeChrome(
                label = "Caméra", exit = exit(),
                confirm = MeeshyModeAction(title = "Valider", onClick = {}, icon = MeeshyIcons.Check, display = MeeshyModeCapsuleDisplay.Glyph),
            )
        }

        compose.onNodeWithContentDescription("Valider").assertHasClickAction()
    }

    @Test
    fun `une capsule occupee dit en cours, une capsule desactivee est annoncee desactivee`() {
        show { MeeshyModeChrome(label = "Retouche", exit = exit(), confirm = confirm(busy = true)) }
        compose.onNodeWithContentDescription("Valider")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, word(R.string.kit_progress_ring_busy)))
    }

    @Test
    fun `une validation desactivee n'est pas activable`() {
        show { MeeshyModeChrome(label = "Plan temps", exit = exit(), confirm = confirm(enabled = false)) }

        compose.onNodeWithContentDescription("Valider").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Quitter").assertIsEnabled()
    }

    @Test
    fun `la plaque est un groupe nomme, et sans plaque il n'y a ni groupe ni bande`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit(), plateLabel = "Réglages du dessin", plate = { Text("Pinceau") }) }
        compose.onNodeWithContentDescription("Réglages du dessin").assertExists()
    }

    @Test
    fun `sans plaque, aucun groupe de plaque n'existe`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit(), confirm = confirm()) }

        compose.onAllNodesWithContentDescription("Réglages du dessin").assertCountEquals(0)
    }

    @Test
    fun `sans validation ni centre ni accessoire, seul Quitter existe`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit()) }

        compose.onNodeWithContentDescription("Quitter").assertExists()
        compose.onAllNodesWithContentDescription("Valider").assertCountEquals(0)
    }

    @Test
    fun `l'ordre de lecture - Quitter, centre, validation`() {
        show(width = WIDE) {
            MeeshyModeChrome(
                label = "Caméra", exit = exit(), confirm = confirm(),
                center = { MeeshyModeCapsule(title = "Photos", onClick = {}) },
            )
        }

        val left = listOf("Quitter", "Photos", "Valider").map {
            compose.onNodeWithContentDescription(it).fetchSemanticsNode().boundsInRoot.left
        }
        assertThat(left).isInStrictOrder()
    }

    @Test
    fun `l'accessoire se pose juste avant la validation`() {
        show(width = WIDE) {
            MeeshyModeChrome(
                label = "Caméra", exit = exit(), confirm = confirm(),
                accessory = { MeeshyModeCapsule(title = "Retirer", onClick = {}) },
            )
        }

        val left = listOf("Quitter", "Retirer", "Valider").map {
            compose.onNodeWithContentDescription(it).fetchSemanticsNode().boundsInRoot.left
        }
        assertThat(left).isInStrictOrder()
    }

    // endregion

    // region Les gestes

    @Test
    fun `chaque action part une fois au toucher`() {
        var exits = 0
        var confirms = 0
        show { MeeshyModeChrome(label = "Dessin", exit = exit { exits += 1 }, confirm = confirm({ confirms += 1 })) }

        compose.onNodeWithContentDescription("Quitter").performClick()
        compose.onNodeWithContentDescription("Valider").performClick()

        assertThat(exits to confirms).isEqualTo(1 to 1)
    }

    @Test
    fun `rien ne part d'une validation desactivee ou occupee`() {
        var confirms = 0
        show {
            MeeshyModeChrome(label = "Dessin", exit = exit(), confirm = confirm({ confirms += 1 }, enabled = false))
        }
        compose.onNodeWithContentDescription("Valider").performClick()
        assertThat(confirms).isEqualTo(0)
    }

    @Test
    fun `rien ne part d'une validation occupee`() {
        var confirms = 0
        show { MeeshyModeChrome(label = "Retouche", exit = exit(), confirm = confirm({ confirms += 1 }, busy = true)) }

        compose.onNodeWithContentDescription("Valider").performClick()

        assertThat(confirms).isEqualTo(0)
    }

    @Test
    fun `le retour materiel vaut Quitter, une seule fois`() {
        var exits = 0
        show { MeeshyModeChrome(label = "Dessin", exit = exit { exits += 1 }, confirm = confirm()) }

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertThat(exits).isEqualTo(1)
    }

    @Test
    fun `sans exitOnEscape, le retour materiel n'est pas pris par le cadre`() {
        var exits = 0
        var fallbacks = 0
        compose.activity.onBackPressedDispatcher.addCallback(
            object : androidx.activity.OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    fallbacks += 1
                }
            },
        )
        show { MeeshyModeChrome(label = "Dessin", exit = exit { exits += 1 }, exitOnEscape = false) }

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertThat(exits to fallbacks).isEqualTo(0 to 1)
    }

    @Test
    fun `l'echappement du lecteur d'ecran vaut Quitter`() {
        var exits = 0
        show { MeeshyModeChrome(label = "Dessin", exit = exit { exits += 1 }, confirm = confirm()) }

        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Dessin"))
            .performSemanticsAction(SemanticsActions.Dismiss)

        assertThat(exits).isEqualTo(1)
    }

    @Test
    fun `l'en-tete seul prend lui aussi le retour materiel`() {
        var exits = 0
        show { MeeshyModeHeader(label = "Dessin", exit = exit { exits += 1 }, confirm = confirm()) }

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertThat(exits).isEqualTo(1)
    }

    @Test
    fun `la table des raccourcis - Echap vaut Quitter, Ctrl ou Meta plus Entree vaut Valider, les deux se coupent`() {
        fun resolve(
            key: Key,
            down: Boolean = true,
            command: Boolean = false,
            exitOnEscape: Boolean = true,
            confirmShortcut: Boolean = true,
            hasConfirm: Boolean = true,
        ) = MeeshyModeShortcuts.resolve(key, down, command, exitOnEscape, confirmShortcut, hasConfirm)

        assertThat(resolve(Key.Escape)).isEqualTo(MeeshyModeShortcut.Exit)
        assertThat(resolve(Key.Enter, command = true)).isEqualTo(MeeshyModeShortcut.Confirm)
        assertThat(resolve(Key.NumPadEnter, command = true)).isEqualTo(MeeshyModeShortcut.Confirm)
        assertThat(resolve(Key.Enter)).isNull()
        assertThat(resolve(Key.Escape, down = false)).isNull()
        assertThat(resolve(Key.Escape, exitOnEscape = false)).isNull()
        assertThat(resolve(Key.Enter, command = true, confirmShortcut = false)).isNull()
        assertThat(resolve(Key.Enter, command = true, hasConfirm = false)).isNull()
        assertThat(resolve(Key.A, command = true)).isNull()
    }

    // endregion

    // region La presence

    @Test
    fun `range, ni en-tete ni plaque n'existent et rien ne recoit de toucher`() {
        show {
            MeeshyModeChrome(
                label = "Caméra", exit = exit(), confirm = confirm(), presence = MeeshyModeChromePresence.Stowed,
                plateLabel = "Réglages", plate = { Text("Pinceau") },
            )
        }

        compose.onAllNodesWithContentDescription("Quitter").assertCountEquals(0)
        compose.onAllNodesWithContentDescription("Valider").assertCountEquals(0)
        compose.onAllNodesWithContentDescription("Réglages").assertCountEquals(0)
    }

    @Test
    fun `range, le retour materiel n'est pas pris par le cadre`() {
        var exits = 0
        var fallbacks = 0
        compose.activity.onBackPressedDispatcher.addCallback(
            object : androidx.activity.OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    fallbacks += 1
                }
            },
        )
        show { MeeshyModeChrome(label = "Caméra", exit = exit { exits += 1 }, presence = MeeshyModeChromePresence.Stowed) }

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertThat(exits to fallbacks).isEqualTo(0 to 1)
    }

    @Test
    fun `l'hote range puis montre le cadre - il revient intact`() {
        var presence by mutableStateOf(MeeshyModeChromePresence.Stowed)
        show { MeeshyModeChrome(label = "Caméra", exit = exit(), confirm = confirm(), presence = presence) }
        compose.onAllNodesWithContentDescription("Quitter").assertCountEquals(0)

        presence = MeeshyModeChromePresence.Shown
        compose.mainClock.advanceTimeBy(ENTER_SETTLE_MILLIS)
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Quitter").assertExists()
        compose.onNodeWithContentDescription("Valider").assertExists()
    }

    // endregion

    // region Le contenu de l'hote derriere

    @Test
    fun `un toucher hors des capsules et de la plaque atteint le contenu de l'hote`() {
        var hostTaps = 0
        show {
            Box(Modifier.fillMaxSize().testTag(HOST).clickable { hostTaps += 1 })
            MeeshyModeChrome(
                label = "Dessin", exit = exit(), confirm = confirm(),
                plateLabel = "Réglages du dessin", plate = { Text("Pinceau") },
            )
        }

        compose.onNodeWithTag(HOST).performTouchInput { click(center) }

        assertThat(hostTaps).isEqualTo(1)
    }

    @Test
    fun `un toucher sur la plaque n'atteint pas le contenu de l'hote`() {
        var hostTaps = 0
        show {
            Box(Modifier.fillMaxSize().testTag(HOST).clickable { hostTaps += 1 })
            MeeshyModeChrome(
                label = "Dessin", exit = exit(), plateLabel = "Réglages du dessin",
                plate = { Text("Pinceau") }, safeBottom = 0.dp,
            )
        }

        compose.onNodeWithContentDescription("Réglages du dessin").performTouchInput { click() }

        assertThat(hostTaps).isEqualTo(0)
    }

    // endregion

    // region Les cibles et l'ajustement

    @Test
    fun `la capsule visible fait 44 dp de haut et sa cible 48 dp`() {
        show { MeeshyModeChrome(label = "Dessin", exit = exit(), confirm = confirm()) }

        listOf("Quitter", "Valider").forEach {
            compose.onNodeWithContentDescription(it).assertHeightIsEqualTo(44.dp).assertTouchHeightIsEqualTo(48.dp)
        }
    }

    @Test
    fun `dans un cadre large, le centre garde son titre`() {
        val center: @Composable () -> Unit = {
            MeeshyModeCapsule(title = "Photos", onClick = {}, icon = MeeshyIcons.Download, display = MeeshyModeCapsuleDisplay.GlyphAndTitle)
        }
        show(width = WIDE) { MeeshyModeChrome(label = "Retouche", exit = exit(), confirm = confirm(), center = center) }
        val wide = compose.onNodeWithContentDescription("Photos").fetchSemanticsNode().size.width

        assertThat(wide).isAtLeast(with(compose.density) { 52.dp.roundToPx() })
    }

    @Test
    fun `un cadre trop etroit tronque le centre en dernier recours, jamais Quitter`() {
        val center: @Composable () -> Unit = {
            MeeshyModeCapsule(title = "Photos", onClick = {}, icon = MeeshyIcons.Download, display = MeeshyModeCapsuleDisplay.GlyphAndTitle)
        }
        show(width = TIGHT) { MeeshyModeChrome(label = "Retouche", exit = exit(), confirm = confirm(), center = center) }

        val exitWidth = compose.onNodeWithContentDescription("Quitter").fetchSemanticsNode().size.width
        val centerWidth = compose.onNodeWithContentDescription("Photos").fetchSemanticsNode().size.width

        assertThat(centerWidth).isLessThan(exitWidth)
        assertThat(exitWidth).isAtLeast(with(compose.density) { 44.dp.roundToPx() })
    }

    // endregion

    // region Le non-re-rendu

    @Test
    fun `un reglage de la plaque ne recompose pas l'en-tete`() {
        var setting by mutableIntStateOf(0)
        var centerCompositions = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                val center: @Composable () -> Unit = remember {
                    {
                        SideEffect { centerCompositions += 1 }
                        Text("Photos")
                    }
                }
                val quit = remember { exit() }
                val validate = remember { confirm() }
                Box(Modifier.size(FRAME_WIDTH.dp, FRAME_HEIGHT.dp)) {
                    MeeshyModeChrome(
                        label = "Dessin", exit = quit, confirm = validate, center = center,
                        plateLabel = "Réglages du dessin", plate = { Text("valeur $setting") },
                    )
                }
            }
        }
        compose.waitForIdle()
        val before = centerCompositions

        setting = 1
        compose.waitForIdle()
        setting = 2
        compose.waitForIdle()

        assertThat(before).isAtLeast(1)
        assertThat(centerCompositions).isEqualTo(before)
    }

    @Test
    fun `une plaque qui disparait quitte l'arbre sans laisser de bande`() {
        var hasPlate by mutableStateOf(true)
        show {
            MeeshyModeChrome(
                label = "Dessin", exit = exit(),
                plateLabel = "Réglages du dessin", plate = if (hasPlate) ({ Text("Pinceau") }) else null,
            )
        }
        compose.onNodeWithContentDescription("Réglages du dessin").assertExists()

        hasPlate = false
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Réglages du dessin").assertDoesNotExist()
    }

    // endregion

    private companion object {
        const val FRAME = "frame"
        const val HOST = "host"
        const val FRAME_WIDTH = 390
        const val FRAME_HEIGHT = 600
        const val WIDE = 600
        const val TIGHT = 120
        const val ENTER_SETTLE_MILLIS = 400L
    }
}
