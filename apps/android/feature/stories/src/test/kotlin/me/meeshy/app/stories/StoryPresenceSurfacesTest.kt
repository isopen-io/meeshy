package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.StoryViewer
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les viewers d'une story et les auteurs de ses commentaires portent le point de présence vivant,
 * comme iOS (#13745). Rien servi pour le compte, aucun point.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryPresenceSurfacesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun viewer(id: String) = StoryViewer(
        id = id,
        username = "ana",
        displayName = "Ana",
        avatarUrl = null,
        viewedAt = null,
        reactionEmoji = null,
    )

    @Test
    fun `un viewer de story a le point que la carte vivante sert`() {
        compose.showWithPresence(presenceStore(live = mapOf("u1" to PresenceState.ONLINE))) { ViewerRow(viewer("u1")) }

        compose.assertDot(PresenceState.ONLINE)
    }

    @Test
    fun `un viewer dont rien n'est servi n'a aucun point`() {
        compose.showWithPresence(presenceStore()) { ViewerRow(viewer("u1")) }

        compose.assertNoDot()
    }
}
