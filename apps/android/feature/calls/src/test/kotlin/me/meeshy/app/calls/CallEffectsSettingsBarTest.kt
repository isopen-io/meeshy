package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import me.meeshy.sdk.model.call.effects.CallEffectsModeState
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.call.effects.category
import me.meeshy.sdk.model.call.effects.kind
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * P8b · #17902 — la barre d'Effets parle la langue du composer : ‹ · Réglages · (+), sans Quitter ni Valider ; Réglages range
 * les puces. C'est la barre du Montage aussi (loi 14, #16979) : (+) porte l'appui long qui liste les effets appliqués, et le
 * lecteur d'écran a la même liste par une action nommée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallEffectsSettingsBarTest {
    @get:Rule val rule = createComposeRule()

    private fun opening() = CallEffectsModeState.opening(VideoFilterConfig())

    private fun host(initial: CallEffectsModeState, onBack: () -> Unit = {}, current: (CallEffectsModeState) -> Unit = {}) {
        var mode by mutableStateOf(initial)
        rule.setContent {
            MeeshyTheme {
                EffectsBar(
                    chips = CallEffectsCategory.entries.map { it.kind },
                    selected = mode.category.kind,
                    bar = mode.bar,
                    layers = mode.layers,
                    reduceMotion = true,
                    onBack = onBack,
                    onSettings = { mode = mode.togglingSettings().also(current) },
                    onAddLook = { mode = mode.addingLook().also(current) },
                    onShowApplied = { mode = mode.showingApplied().also(current) },
                    onChip = { kind -> kind.category?.let { mode = mode.showing(it).also(current) } },
                )
            }
        }
    }

    /**
     * Trois couches RÉELLEMENT appliquées : la pile suit la configuration (`CallEffectsStackRule`, comme iOS), donc le
     * filtre et l'effet de visage vivent dans la configuration, pas seulement dans la pile donnée à l'ouverture.
     */
    private fun full() = CallEffectsModeState.opening(
        CallEffectsModeRule.applying(VideoFilterPreset.Golden, VideoFilterConfig().selectingFaceEffect(CallFaceEffect.Toad)),
        CallEffectLayers.of(
            listOf(
                CallEffectLayer(CallEffectKind.Frame, "frame-1"),
                CallEffectLayer(CallEffectKind.Color, "golden"),
                CallEffectLayer(CallEffectKind.Face, "toad"),
            ),
        ),
    )

    @Test
    fun `la barre porte Retour, Reglages et Ajouter un look, et plus ni Quitter ni Valider (P8b_4, P8b_5)`() {
        var backs = 0
        var last = opening()
        host(opening(), onBack = { backs++ }) { last = it }

        rule.onNodeWithContentDescription("Quit").assertDoesNotExist()
        rule.onNodeWithContentDescription("Apply").assertDoesNotExist()
        rule.onNodeWithContentDescription("Add another look").performClick()
        rule.runOnIdle { assertThat(last.category).isEqualTo(CallEffectsCategory.Color) }
        rule.onNodeWithContentDescription("Back to the call").performClick()
        rule.runOnIdle { assertThat(backs).isEqualTo(1) }
    }

    @Test
    fun `Reglages retire les puces de la barre, et les rend au second toucher (P8b_6)`() {
        var last = opening()
        host(opening()) { last = it }

        rule.onNodeWithText("Face").assertExists()
        rule.onNodeWithContentDescription("Settings").performClick()
        rule.waitForIdle()
        assertThat(last.showsSettings).isTrue()
        rule.onNodeWithText("Face").assertDoesNotExist()

        rule.onNodeWithContentDescription("Settings").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Face").assertExists()
    }

    @Test
    fun `l'appui long sur (+) liste les effets appliques et retire les puces (#16979)`() {
        var last = opening().selecting(CallFaceEffect.Toad)
        host(last) { last = it }

        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()

        assertThat(last.showsApplied).isTrue()
        rule.onNodeWithText("Face").assertDoesNotExist()
    }

    @Test
    fun `sans effet applique, l'appui long sur (+) ne liste rien`() {
        var last = opening()
        host(opening()) { last = it }

        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()

        assertThat(last.showsApplied).isFalse()
        val actions = rule.onNodeWithContentDescription("Add another look").fetchSemanticsNode().config
            .getOrElse(SemanticsActions.CustomActions) { emptyList() }
        assertThat(actions).isEmpty()
    }

    @Test
    fun `le lecteur d'ecran a la liste par une action nommee sur (+), sans appui long (#16979)`() {
        var last = opening().selecting(CallFaceEffect.Toad)
        host(last) { last = it }

        val node = rule.onNodeWithContentDescription("Add another look").fetchSemanticsNode()
        val action = node.config[SemanticsActions.CustomActions].first { it.label == "Applied effects" }
        rule.runOnUiThread { action.action() }
        rule.waitForIdle()

        assertThat(last.showsApplied).isTrue()
    }

    @Test
    fun `avec trois couches (+) n'ajoute plus, le dit a son etiquette et garde son appui long (#16979)`() {
        var last = full()
        assertThat(last.layers.isFull).isTrue()
        host(last) { last = it }

        rule.onNodeWithContentDescription("Add another look").assertDoesNotExist()
        val plus = rule.onNodeWithContentDescription("Three effects at most").fetchSemanticsNode()
        assertThat(plus.config[SemanticsActions.OnClick].label).isEqualTo("Cancel an effect to add another; long press to see them")
        rule.onNodeWithContentDescription("Three effects at most").performClick()
        rule.runOnIdle { assertThat(last.category).isEqualTo(CallEffectsCategory.Face) }
        rule.onNodeWithContentDescription("Three effects at most").performTouchInput { longClick() }
        rule.waitForIdle()

        assertThat(last.showsApplied).isTrue()
    }

    @Test
    fun `la liste va de la couche du dessus a celle du dessous, annuler en retire une seule`() {
        val removed = mutableListOf<CallEffectKind>()
        val layers = full().layers
        assertThat(layers.listed.map { it.kind }).containsExactly(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame).inOrder()
        rule.setContent { MeeshyTheme { EffectsAppliedPanel(layers) { removed += it } } }

        rule.onNodeWithText("Applied effects").assertExists()
        rule.onNodeWithText("Face · Toad").assertExists()
        rule.onNodeWithText("Colour · Golden").assertExists()
        rule.onNodeWithContentDescription("Cancel Colour · Golden").performClick()

        assertThat(removed).containsExactly(CallEffectKind.Color)
        val tops = listOf("Face · Toad", "Colour · Golden").map { rule.onNodeWithText(it).fetchSemanticsNode().positionInRoot.y }
        assertThat(tops).isInOrder()
    }

    @Test
    fun `le panneau porte la luminosite et une ligne Flou du fond qui bascule toute entiere (P8b_3)`() {
        var mode by mutableStateOf(opening().togglingSettings())
        rule.setContent {
            MeeshyTheme { EffectsSettingsPanel(mode, onChange = { mode = it }) }
        }

        rule.onNodeWithContentDescription("Brightness").assertExists()
        assertThat(mode.current.backgroundBlurEnabled).isFalse()
        rule.onNodeWithText("Background blur").performClick()
        rule.runOnIdle { assertThat(mode.current.backgroundBlurEnabled).isTrue() }
    }
}
