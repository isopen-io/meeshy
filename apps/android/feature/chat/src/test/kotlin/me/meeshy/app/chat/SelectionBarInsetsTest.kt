package me.meeshy.app.chat

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import me.meeshy.sdk.model.composer.ComposerBottomClearance
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13376 — la barre d'actions de la sélection se pose AU-DESSUS de la barre système, pas dessous. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SelectionBarInsetsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun copyBottomAboveRootBottom(): Float {
        val offer = SelectionOffer(forward = true, copy = true, star = true, deleteForMe = true, deleteForEveryone = false)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.fillMaxSize()) {
                    SelectionBar(
                        count = 2,
                        offer = offer,
                        accentColor = MeeshyPalette.Indigo500,
                        onCancel = {}, onDelete = {}, onCopy = {}, onStar = {}, onForward = {},
                        modifier = Modifier.align(Alignment.BottomCenter),
                    )
                }
            }
        }
        compose.waitForIdle()
        val copy = compose.onNodeWithContentDescription(
            ApplicationProvider.getApplicationContext<Context>().getString(R.string.chat_action_copy),
        ).getUnclippedBoundsInRoot()
        val root = compose.onRoot().getUnclippedBoundsInRoot()
        return (root.bottom - copy.bottom).value
    }

    @Test
    fun `by default the bar keeps the door clearance above the bottom edge, like the composer`() {
        assertThat(copyBottomAboveRootBottom()).isAtLeast(ComposerBottomClearance.DOOR_DIAMETER_DP)
    }
}
