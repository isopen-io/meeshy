package me.meeshy.ui.component.imageedit

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h300dp-mdpi")
class CropOverlayGestureTest {
    @get:Rule val compose = createComposeRule()

    private fun drag(from: Offset, to: Offset) =
        compose.onNodeWithTag("host").performTouchInput { swipe(from, to, 200) }

    @Test fun `glisser le centre deplace le cadre entier`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        drag(Offset(200f, 175f), Offset(230f, 195f))
        assertThat(h.rect.width).isEqualTo(200f)
        assertThat(h.rect.left).isGreaterThan(100f)
        assertThat(h.rect.top).isGreaterThan(100f)
    }

    @Test fun `glisser un coin libre redimensionne le cadre`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        drag(Offset(300f, 250f), Offset(340f, 280f))
        assertThat(h.rect.width).isGreaterThan(200f)
        assertThat(h.rect.left).isEqualTo(100f)
        assertThat(h.interactions).isAtLeast(1)
    }

    @Test fun `en mode ratio le coin garde le ratio`() {
        val h = CropHarness().apply { rect = rect.copy(height = 100f) }
        compose.setContent { h.Content(aspectRatio = 2.0) }
        drag(Offset(300f, 200f), Offset(340f, 210f))
        assertThat(h.rect.width / h.rect.height).isWithin(1e-3f).of(2f)
        assertThat(h.rect.width).isGreaterThan(200f)
    }

    @Test fun `un geste hors du cadre ne change rien`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        drag(Offset(20f, 20f), Offset(60f, 60f))
        assertThat(h.rect).isEqualTo(CropRect0)
        assertThat(h.interactions).isEqualTo(0)
    }

    @Test fun `relacher un cadre sorti de l'image le ramene dans les bornes`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        drag(Offset(200f, 175f), Offset(390f, 295f))
        assertThat(h.display.contains(h.rect)).isTrue()
    }

    private companion object {
        val CropRect0 = me.meeshy.sdk.model.imageedit.CropRect(100f, 100f, 200f, 150f)
    }
}
