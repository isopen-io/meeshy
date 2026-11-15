package me.meeshy.ui.component.kit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.isFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.feedback.HapticSink
import me.meeshy.sdk.feedback.HapticSurfacing
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K14 — l'HÔTE de la capsule : un retour haptique par `id` par le site unique, aucun avec `None`, la sortie à l'heure de la
 * loi (horloge du test, jamais celle du mur), persistante avec une action, un minuteur qui ne ferme jamais son successeur,
 * l'action et la fermeture qui retirent par l'`id`. Miroir des témoins de séance de `MeeshyStatusCapsuleTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyStatusCapsuleHostTest {

    @get:Rule
    val compose = createComposeRule()

    private class Recorder : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) {
            received += feedbackConstant
        }
    }

    private class Scene(
        val recorder: Recorder = Recorder(),
        var screenReader: Boolean = false,
        var recommendedFloor: Int = 0,
    ) {
        var item by mutableStateOf<MeeshyStatusCapsuleItem?>(null)
        val dismissed = mutableListOf<String>()
    }

    private fun host(scene: Scene, haptic: MeeshyStatusCapsuleHostHaptic = MeeshyStatusCapsuleHostHaptic.Automatic) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyStatusCapsuleHostImpl(
                    item = scene.item,
                    onDismiss = { id -> scene.dismissed += id },
                    modifier = Modifier,
                    edge = MeeshyStatusCapsuleEdge.Bottom,
                    haptic = haptic,
                    haptics = MeeshyHaptics(HapticSurfacing(scene.recorder, 35)),
                    environment = MeeshyStatusCapsuleEnvironment(
                        nowMillis = { compose.mainClock.currentTime },
                        isScreenReaderOn = { scene.screenReader },
                        recommendedMillis = { original, _, _ -> maxOf(original, scene.recommendedFloor) },
                    ),
                )
            }
        }
        step(1)
    }

    /** Pose l'élément sur le fil de l'UI et applique l'écriture : l'horloge figée ne le fait pas seule. */
    private fun present(scene: Scene, item: MeeshyStatusCapsuleItem?) {
        compose.runOnUiThread {
            scene.item = item
            Snapshot.sendApplyNotifications()
        }
    }

    private fun step(milliseconds: Long) {
        compose.mainClock.advanceTimeBy(milliseconds)
    }

    private fun haptic(kind: HapticKind): Int = HapticSurfacing.constantFor(kind, 35)

    private fun item(
        id: String = "limit.text",
        message: String = "Limite atteinte",
        kind: MeeshyStatusCapsuleKind = MeeshyStatusCapsuleKind.Info,
        action: MeeshyStatusCapsuleAction? = null,
        onDismiss: (() -> Unit)? = null,
        closeLabel: String? = null,
        duration: MeeshyStatusCapsuleDuration = MeeshyStatusCapsuleDuration.Automatic,
        occurrence: Int = 0,
    ) = MeeshyStatusCapsuleItem(
        id = id,
        message = message,
        kind = kind,
        action = action,
        onDismiss = onDismiss,
        closeLabel = closeLabel,
        duration = duration,
        occurrence = occurrence,
    )

    // region L'apparition

    @Test
    fun `sans element, l'hote ne montre rien et ne vibre pas`() {
        val scene = Scene()
        host(scene)

        compose.onNodeWithContentDescription("Limite atteinte").assertDoesNotExist()
        assertThat(scene.recorder.received).isEmpty()
    }

    @Test
    fun `un element paraît avec le retour haptique de sa nature, une seule fois`() {
        val scene = Scene()
        host(scene)

        present(scene, item(kind = MeeshyStatusCapsuleKind.Failure))
        step(100)

        compose.onNodeWithContentDescription("Limite atteinte").assertExists()
        assertThat(scene.recorder.received).containsExactly(haptic(HapticKind.ERROR))
    }

    @Test
    fun `chaque nature joue son retour`() {
        val expected = mapOf(
            MeeshyStatusCapsuleKind.Info to HapticKind.LIGHT,
            MeeshyStatusCapsuleKind.Success to HapticKind.SUCCESS,
            MeeshyStatusCapsuleKind.Warning to HapticKind.WARNING,
            MeeshyStatusCapsuleKind.Failure to HapticKind.ERROR,
        )
        val scene = Scene()
        host(scene)

        expected.entries.forEachIndexed { index, (kind, played) ->
            present(scene, item(id = "kind.$index", kind = kind))
            step(100)
            assertThat(scene.recorder.received.last()).isEqualTo(haptic(played))
        }
        assertThat(scene.recorder.received).hasSize(expected.size)
    }

    @Test
    fun `avec none, l'app joue le sien, l'hote ne vibre pas`() {
        val scene = Scene()
        host(scene, haptic = MeeshyStatusCapsuleHostHaptic.None)

        present(scene, item(kind = MeeshyStatusCapsuleKind.Failure))
        step(100)

        compose.onNodeWithContentDescription("Limite atteinte").assertExists()
        assertThat(scene.recorder.received).isEmpty()
    }

    @Test
    fun `le meme element repose ne rejoue rien`() {
        val scene = Scene()
        host(scene)
        present(scene, item())
        step(100)

        present(scene, item())
        step(100)

        assertThat(scene.recorder.received).hasSize(1)
    }

    @Test
    fun `le meme id redit dans les 2 s se tait, il reparle apres`() {
        val scene = Scene()
        host(scene)
        present(scene, item(occurrence = 0))
        step(100)

        present(scene, item(occurrence = 1))
        step(1000)
        assertThat(scene.recorder.received).hasSize(1)

        step(1200)
        present(scene, item(occurrence = 2))
        step(100)
        assertThat(scene.recorder.received).hasSize(2)
    }

    @Test
    fun `un autre id parle tout de suite`() {
        val scene = Scene()
        host(scene)
        present(scene, item(id = "limit.text"))
        step(10)

        present(scene, item(id = "limit.image", message = "Image"))
        step(10)

        assertThat(scene.recorder.received).hasSize(2)
    }

    @Test
    fun `l'apparition ne prend jamais le focus`() {
        val scene = Scene()
        host(scene)

        present(scene, item(action = MeeshyStatusCapsuleAction("Réessayer") { }, closeLabel = "Fermer", onDismiss = { }))
        step(100)

        compose.onNodeWithText("Réessayer").assertExists()
        compose.onAllNodes(isFocused()).assertCountEquals(0)
    }

    @Test
    fun `l'hote ne prend aucun doigt hors de la capsule, le toucher traverse jusqu'a la scene`() {
        var below = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.matchParentSize().testTag("scene").clickable { below++ })
                    MeeshyStatusCapsuleHostImpl(
                        item = item(action = MeeshyStatusCapsuleAction("Réessayer") { }),
                        onDismiss = { },
                        modifier = Modifier,
                        edge = MeeshyStatusCapsuleEdge.Bottom,
                        haptic = MeeshyStatusCapsuleHostHaptic.None,
                        haptics = MeeshyHaptics(HapticSurfacing(Recorder(), 35)),
                        environment = MeeshyStatusCapsuleEnvironment(
                            nowMillis = { 0L },
                            isScreenReaderOn = { false },
                            recommendedMillis = { original, _, _ -> original },
                        ),
                    )
                }
            }
        }

        compose.onNodeWithTag("scene").performTouchInput { click(Offset(centerX, top + 4f)) }

        assertThat(below).isEqualTo(1)
    }

    // endregion

    // region Le minuteur

    @Test
    fun `sans action, elle se retire a 4 s, pas avant`() {
        val scene = Scene()
        host(scene)
        present(scene, item())
        step(3900)
        assertThat(scene.dismissed).isEmpty()

        step(200)

        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    @Test
    fun `sous lecteur d'ecran, elle reste au moins 6 s`() {
        val scene = Scene(screenReader = true)
        host(scene)
        present(scene, item())
        step(5900)
        assertThat(scene.dismissed).isEmpty()

        step(200)

        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    @Test
    fun `la duree que le systeme recommande l'emporte quand elle est plus longue`() {
        val scene = Scene(recommendedFloor = 10_000)
        host(scene)
        present(scene, item())
        step(9900)
        assertThat(scene.dismissed).isEmpty()

        step(200)

        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    @Test
    fun `une duree imposee par l'hote l'emporte`() {
        val scene = Scene()
        host(scene)
        present(scene, item(duration = MeeshyStatusCapsuleDuration.Milliseconds(2500)))
        step(2400)
        assertThat(scene.dismissed).isEmpty()

        step(200)

        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    @Test
    fun `avec une action, elle reste tant que l'hote ne la retire pas`() {
        val scene = Scene()
        host(scene)
        present(scene, item(action = MeeshyStatusCapsuleAction("Réessayer") { }))

        step(60_000)

        assertThat(scene.dismissed).isEmpty()
        compose.onNodeWithText("Réessayer").assertExists()
    }

    @Test
    fun `une capsule persistante ne se retire jamais seule`() {
        val scene = Scene()
        host(scene)
        present(scene, item(duration = MeeshyStatusCapsuleDuration.Persistent))

        step(60_000)

        assertThat(scene.dismissed).isEmpty()
    }

    @Test
    fun `un minuteur en retard ne ferme jamais son successeur`() {
        val scene = Scene()
        host(scene)
        present(scene, item(id = "first"))
        step(3000)

        present(scene, item(id = "second", message = "Autre", duration = MeeshyStatusCapsuleDuration.Persistent))
        step(10_000)

        assertThat(scene.dismissed).doesNotContain("first")
        assertThat(scene.dismissed).isEmpty()
    }

    @Test
    fun `l'element retire par l'app ne rappelle plus rien`() {
        val scene = Scene()
        host(scene)
        present(scene, item())
        step(1000)

        present(scene, null)
        step(10_000)

        assertThat(scene.dismissed).isEmpty()
    }

    // endregion

    // region L'action et la fermeture

    @Test
    fun `l'action part une fois puis l'hote retire la capsule par son id`() {
        var performed = 0
        val scene = Scene()
        host(scene)
        present(scene, item(action = MeeshyStatusCapsuleAction("Réessayer") { performed++ }))
        step(100)

        compose.onNodeWithText("Réessayer").performClick()
        step(10)

        assertThat(performed).isEqualTo(1)
        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    @Test
    fun `la croix appelle la fermeture de l'element puis retire par l'id`() {
        var closed = 0
        val scene = Scene()
        host(scene)
        present(scene, item(closeLabel = "Fermer", onDismiss = { closed++ }))
        step(100)

        compose.onNodeWithContentDescription("Fermer").performClick()
        step(10)

        assertThat(closed).isEqualTo(1)
        assertThat(scene.dismissed).containsExactly("limit.text")
    }

    // endregion
}
