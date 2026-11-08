package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleBodyFooterLayoutRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(bodyWidth: Int, footerWidth: Int) {
        compose.setContent {
            Box(Modifier.widthIn(max = 300.dp).testTag("root")) {
                BubbleBodyFooterLayout(
                    body = { Box(Modifier.width(bodyWidth.dp).height(20.dp)) },
                    footer = { Box(Modifier.width(footerWidth.dp).height(10.dp)) },
                )
            }
        }
    }

    @Test
    fun `le pied prend exactement la largeur du corps et ne l'elargit pas`() {
        show(bodyWidth = 200, footerWidth = 60)
        compose.onNodeWithTag("root").assertWidthIsEqualTo(200.dp)
    }

    @Test
    fun `le plancher du pied est sa largeur intrinseque`() {
        show(bodyWidth = 40, footerWidth = 90)
        compose.onNodeWithTag("root").assertWidthIsEqualTo(90.dp)
    }

    @Test
    fun `jamais au dela de la contrainte maximale`() {
        show(bodyWidth = 500, footerWidth = 60)
        compose.onNodeWithTag("root").assertWidthIsEqualTo(300.dp)
    }
}
