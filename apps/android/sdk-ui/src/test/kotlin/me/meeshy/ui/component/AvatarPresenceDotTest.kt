package me.meeshy.ui.component

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AvatarPresenceDotTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(presence: PresenceState?, isHere: Boolean = false, reduceMotion: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                    AvatarPresenceDot(presence = presence, avatarSize = 48f, isHere = isHere)
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `hors ligne ne rend aucun noeud`() {
        show(PresenceState.OFFLINE)

        compose.onAllNodesWithTag(AvatarPresenceDotTestTag).assertCountEquals(0)
    }

    @Test
    fun `une presence absente ne rend aucun noeud`() {
        show(null)

        compose.onAllNodesWithTag(AvatarPresenceDotTestTag).assertCountEquals(0)
    }

    @Test
    fun `en ligne rend un point annonce En ligne`() {
        show(PresenceState.ONLINE)

        compose.onNodeWithContentDescription("Online").assertIsDisplayed()
    }

    @Test
    fun `ici l'emporte sur toute presence`() {
        show(PresenceState.ONLINE, isHere = true)

        compose.onNodeWithContentDescription("In the conversation").assertIsDisplayed()
        compose.onAllNodesWithTag(AvatarPresenceDotTestTag).assertCountEquals(1)
    }

    @Test
    fun `ici se rend meme sans presence servie`() {
        show(null, isHere = true)

        compose.onNodeWithContentDescription("In the conversation").assertIsDisplayed()
    }

    @Test
    fun `sous reduction des animations le point reste rendu et statique`() {
        show(PresenceState.ONLINE, reduceMotion = true)

        compose.onNodeWithContentDescription("Online").assertIsDisplayed()
    }
}
