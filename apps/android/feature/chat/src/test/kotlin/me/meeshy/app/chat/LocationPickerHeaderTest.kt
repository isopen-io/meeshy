package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13388 — « Annuler » et le titre reposent sur le fond de l'en-tête, qui couvre toute la largeur, du haut de la feuille. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LocationPickerHeaderTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the header surface spans the sheet and carries the cancel button`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.fillMaxSize()) { PickerHeader(accent = Color.Blue, onCancel = {}) }
            }
        }
        compose.waitForIdle()

        val header = compose.onNodeWithTag(PICKER_HEADER_TAG).getUnclippedBoundsInRoot()
        val root = compose.onRoot().getUnclippedBoundsInRoot()
        val cancel = compose.onNodeWithText(
            androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.common_cancel),
        ).getUnclippedBoundsInRoot()

        assertThat(header.top.value).isEqualTo(0f)
        assertThat(header.width.value).isEqualTo(root.width.value)
        assertThat(cancel.top).isAtLeast(header.top)
        assertThat(cancel.bottom).isAtMost(header.bottom)
    }
}
