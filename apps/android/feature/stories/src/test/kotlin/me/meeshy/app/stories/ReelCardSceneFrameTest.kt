package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width as widthModifier
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13727 — le cadrage RÉEL de la scène d'un réel sur sa carte (iOS `.aspectRatio(SceneShape.aspect, .fill)`) : le 9:16 couvre
 * la carte, centré et rogné ; et une hauteur non bornée (carte dans un défilement) ne plante pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReelCardSceneFrameTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la scene couvre une carte 4 5 et deborde egalement en haut et en bas`() {
        compose.setContent {
            Box(Modifier.size(width = 200.dp, height = 250.dp).testTag("card")) {
                ReelCardSceneFrame(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize().testTag("scene")) }
            }
        }
        val card = compose.onNodeWithTag("card").getUnclippedBoundsInRoot()
        val scene = compose.onNodeWithTag("scene").getUnclippedBoundsInRoot()

        assertThat(scene.width.value).isWithin(1f).of(200f)
        assertThat(scene.height.value).isWithin(1f).of(200f * 16f / 9f)
        val above = card.top.value - scene.top.value
        val below = scene.bottom.value - card.bottom.value
        assertThat(above).isWithin(1f).of(below)
        assertThat(above).isGreaterThan(0f)
    }

    @Test
    fun `une scene plus etroite que le 9 16 deborde a gauche et a droite`() {
        compose.setContent {
            Box(Modifier.size(width = 100.dp, height = 400.dp).testTag("card")) {
                ReelCardSceneFrame(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize().testTag("scene")) }
            }
        }
        val card = compose.onNodeWithTag("card").getUnclippedBoundsInRoot()
        val scene = compose.onNodeWithTag("scene").getUnclippedBoundsInRoot()

        assertThat(scene.height.value).isWithin(1f).of(400f)
        assertThat(scene.width.value).isWithin(1f).of(400f * 9f / 16f)
        assertThat(card.left.value - scene.left.value).isWithin(1f).of(scene.right.value - card.right.value)
    }

    @Test
    fun `dans un defilement la hauteur est celle du 9 16 et rien ne plante`() {
        compose.setContent {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                ReelCardSceneFrame(Modifier.widthModifier(200.dp).testTag("card")) { Box(Modifier.fillMaxSize().testTag("scene")) }
            }
        }
        val card = compose.onNodeWithTag("card").getUnclippedBoundsInRoot()

        assertThat(card.width.value).isWithin(1f).of(200f)
        assertThat(card.height.value).isWithin(1f).of(200f * 16f / 9f)
    }
}
