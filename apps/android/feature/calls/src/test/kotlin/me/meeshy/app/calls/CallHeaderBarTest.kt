package me.meeshy.app.calls

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallHeaderNames
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallHeaderBarTest {
    @get:Rule val rule = createComposeRule()

    private fun connected(video: Boolean, peerQualityDegraded: Boolean = false) = CallPresenter.present(
        CallState.Connected,
        CallConfig(peerId = "u1", peerName = "Alice", isVideo = video, isOutgoing = true),
        CallMedia(),
        elapsedSeconds = 65,
        mediaEstablished = true,
        peerQualityDegraded = peerQualityDegraded,
    )

    @Test
    fun `l'en-tete porte Reduire et Conversation, et Conversation ouvre la conversation sans reduire`() {
        var minimized = 0
        var opened = 0
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = true), conversationId = "c1", showsMinimize = true,
                    onMinimize = { minimized++ }, onOpenConversation = { opened++ },
                )
            }
        }
        rule.onNodeWithContentDescription("Minimize").assertExists()
        rule.onNodeWithContentDescription("Conversation").performClick()
        assertThat(opened).isEqualTo(1)
        assertThat(minimized).isEqualTo(0)
        rule.onNodeWithContentDescription("Minimize").performClick()
        assertThat(minimized).isEqualTo(1)
    }

    @Test
    fun `Image dans l'image n'apparait que si l'appel y est eligible, entre Reduire et Conversation`() {
        var entered = 0
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = true), conversationId = "c1", showsMinimize = true, onMinimize = {},
                    canEnterPictureInPicture = true, onEnterPictureInPicture = { entered++ },
                )
            }
        }
        rule.onNodeWithContentDescription("Reduce to Picture-in-Picture").performClick()
        assertThat(entered).isEqualTo(1)
    }

    @Test
    fun `sans eligibilite le bouton d'image dans l'image n'existe pas`() {
        rule.setContent {
            MeeshyTheme { CallHeaderBar(connected(video = true), conversationId = "c1", showsMinimize = true, onMinimize = {}) }
        }
        rule.onNodeWithContentDescription("Reduce to Picture-in-Picture").assertDoesNotExist()
    }

    @Test
    fun `en video la capsule dit le nom donne puis la duree`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = true), conversationId = "c1", showsMinimize = true, onMinimize = {},
                    names = CallHeaderNames(givenName = "Maman", groupName = null),
                )
            }
        }
        rule.onNodeWithText("Maman").assertExists()
        rule.onNodeWithText("Alice").assertDoesNotExist()
        rule.onNodeWithContentDescription("Maman, Call duration").assertExists()
    }

    @Test
    fun `sans nom donne la capsule garde le nom d'affichage`() {
        rule.setContent {
            MeeshyTheme { CallHeaderBar(connected(video = true), conversationId = "c1", showsMinimize = true, onMinimize = {}) }
        }
        rule.onNodeWithText("Alice").assertExists()
    }

    @Test
    fun `sans salon connu la porte vers la conversation disparait, et en audio sain la capsule aussi`() {
        rule.setContent {
            MeeshyTheme { CallHeaderBar(connected(video = false), conversationId = "", showsMinimize = true, onMinimize = {}) }
        }
        rule.onNodeWithContentDescription("Minimize").assertExists()
        rule.onNodeWithContentDescription("Conversation").assertDoesNotExist()
        rule.onNodeWithContentDescription("Call duration", substring = true).assertDoesNotExist()
        rule.onAllNodes(hasClickAction()).assertCountEquals(1)
    }

    @Test
    fun `un groupe sans nom ouvre sa capsule sur le nombre, sans separateur orphelin`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = false), conversationId = "c1", showsMinimize = true, onMinimize = {},
                    isVideoStage = false, isGroupStage = true, participantCount = 3,
                )
            }
        }
        rule.onNodeWithText("3").assertExists()
        rule.onNodeWithText("· 3").assertDoesNotExist()
        rule.onNodeWithContentDescription("Participants 3, Call duration").assertExists()
    }

    @Test
    fun `en audio la reconnexion reste sous l'avatar, la capsule ne la repete pas`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = false, peerQualityDegraded = true).copy(status = CallStatus.RECONNECTING),
                    conversationId = "c1", showsMinimize = true, onMinimize = {},
                )
            }
        }
        rule.onNodeWithContentDescription("Poor network (contact)").assertExists()
    }

    @Test
    fun `en audio le reseau du contact degrade fait une capsule sans nom ni duree`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = false, peerQualityDegraded = true), conversationId = "c1", showsMinimize = true, onMinimize = {},
                    names = CallHeaderNames(givenName = "Maman", groupName = null),
                )
            }
        }
        rule.onNodeWithContentDescription("Poor network (contact)").assertExists()
        rule.onNodeWithText("Maman").assertDoesNotExist()
        rule.onNodeWithContentDescription("Call duration", substring = true).assertDoesNotExist()
    }

    @Test
    fun `en groupe la capsule dit le nom du groupe, le nombre et la duree, meme en audio`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(
                    connected(video = false), conversationId = "c1", showsMinimize = true, onMinimize = {},
                    isVideoStage = false, isGroupStage = true, participantCount = 5,
                    names = CallHeaderNames(givenName = null, groupName = "Les Copains"),
                )
            }
        }
        rule.onNodeWithText("Les Copains").assertExists()
        rule.onNodeWithContentDescription("Les Copains, Participants 5, Call duration").assertExists()
    }

    @Test
    fun `un appel audio dont le pair passe en video porte la capsule du chrono`() {
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(connected(video = false), conversationId = "c1", showsMinimize = true, onMinimize = {}, isVideoStage = true)
            }
        }
        rule.onNodeWithContentDescription("Call duration", substring = true).assertExists()
    }
}
