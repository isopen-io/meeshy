package me.meeshy.ui.component.imageedit

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.CropFrame
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w400dp-h300dp-mdpi")
class CropBakeOnlyIfTouchedTest {
    @get:Rule val compose = createComposeRule()

    @Test fun `ouvrir puis fermer sans saisir le cadre ne cuit rien`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        compose.waitForIdle()
        assertThat(h.interactions).isEqualTo(0)
        assertThat(CropFrame.bake(h.interactions > 0, false, h.rect, h.display)).isNull()
    }

    @Test fun `saisir le cadre arme la cuisson`() {
        val h = CropHarness()
        compose.setContent { h.Content() }
        compose.onNodeWithTag("host").performTouchInput { swipe(Offset(200f, 175f), Offset(210f, 180f), 100) }
        assertThat(h.interactions).isAtLeast(1)
        assertThat(CropFrame.bake(h.interactions > 0, false, h.rect, h.display)).isNotNull()
    }
}
