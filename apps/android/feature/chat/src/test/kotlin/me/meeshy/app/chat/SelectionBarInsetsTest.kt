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
import androidx.compose.ui.unit.dp
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

    private fun copyBottomAboveRootBottom(clearance: Int): Float {
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
                        bottomClearance = clearance.dp,
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
    fun `a clearance of 48 dp keeps every action at least 48 dp above the system bar`() {
        assertThat(copyBottomAboveRootBottom(48)).isAtLeast(48f)
    }
}
