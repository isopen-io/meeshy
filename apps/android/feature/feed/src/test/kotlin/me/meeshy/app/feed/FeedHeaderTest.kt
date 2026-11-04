package me.meeshy.app.feed

import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'en-tête « Meeshy Feed » : boutons Réels et À proximité, bande de stories en accessoire du titre. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedHeaderTest {
    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int) = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    @Test
    fun `les boutons Reels et A proximite ouvrent leur ecran`() {
        var reels = 0
        var nearby = 0
        compose.setContent {
            MeeshyTheme {
                FeedHeader(listState = rememberLazyListState(), onOpenReels = { reels++ }, onOpenNearby = { nearby++ })
            }
        }

        compose.onNodeWithContentDescription(string(R.string.feed_header_reels)).performClick()
        compose.onNodeWithContentDescription(string(R.string.feed_header_nearby)).performClick()

        assertThat(reels).isEqualTo(1)
        assertThat(nearby).isEqualTo(1)
        compose.onNodeWithText(string(R.string.feed_title)).assertIsDisplayed()
    }

    @Test
    fun `la bande de stories epinglee est montee en accessoire du titre`() {
        compose.setContent {
            MeeshyTheme {
                FeedHeader(
                    listState = rememberLazyListState(),
                    onOpenReels = {},
                    onOpenNearby = {},
                    pinnedBand = { Text("bande-stories") },
                )
            }
        }

        compose.onNodeWithText("bande-stories").assertExists()
    }
}
