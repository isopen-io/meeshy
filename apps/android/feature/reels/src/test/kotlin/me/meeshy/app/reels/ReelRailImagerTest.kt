package me.meeshy.app.reels

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #16334 — sur le rail d'un réel, la baguette est « Imager » : elle image le RÉEL entier (la même vue Imager que le menu
 * « ⋯ »). Un réel qui ne se rend pas (images seules) ou un hôte sans atelier ne pose pas de baguette inerte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ReelRailImagerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun reel(vararg mimes: String) = ReelBuilder.build(
        listOf(
            ApiPost(
                id = "r1",
                type = "REEL",
                media = mimes.mapIndexed { i, m -> ApiPostMedia(id = "m$i", mimeType = m, fileUrl = "https://cdn.test/$i") },
            ),
        ),
        mediaBaseUrl = null,
    ).single()

    private val imaged = mutableListOf<String>()

    private fun show(reel: ReelPresentation, imaging: Boolean = true) {
        val actions = ReelRailActions(
            onLike = {}, onReact = { _, _ -> }, onComments = {}, onBookmark = {}, onRepost = {},
            onImager = if (imaging) { id: String -> imaged += id } else null,
        )
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
                    ReelRail(reel = reel, quickEmojis = emptyList(), actions = actions)
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la baguette du rail image le reel`() {
        show(reel("video/mp4"))

        compose.onNodeWithContentDescription("Imager").performClick()

        assertThat(imaged).containsExactly("r1")
    }

    @Test
    fun `un reel fait d'images seules ne s'image pas - pas de baguette`() {
        show(reel("image/jpeg"))

        compose.onAllNodesWithContentDescription("Imager").assertCountEquals(0)
    }

    @Test
    fun `sans atelier branche, pas de baguette inerte`() {
        show(reel("video/mp4"), imaging = false)

        compose.onAllNodesWithContentDescription("Imager").assertCountEquals(0)
    }
}
