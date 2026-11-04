package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertContentDescriptionContains
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AvatarRingResolver
import me.meeshy.ui.appearance.LocalAvatarRingResolver
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #15984 — l'avatar d'une ligne de conversation directe porte le contour que le PAIR a équipé (miroir d'iOS
 * `LentilleConversationRow`, `ring: isDirect ? conversation.participantRing : nil`) ; un groupe n'en porte jamais, et
 * le contour, décoratif, ne change rien à ce que TalkBack lit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationRowAvatarContourTest {

    @get:Rule
    val compose = createComposeRule()

    private val perle = ServedProfileDecorItem(pack = "contours-essentiels", item = "perle", origin = PackOrigin.BUILTIN)
    private val decor = ServedProfileDecor(avatarRing = perle)

    private fun conversation(type: String, peerDecor: ServedProfileDecor?) = ApiConversation(
        id = "c1",
        type = type,
        title = "Team".takeIf { type == "group" },
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-ali", userId = "ali", displayName = "Ali", profileDecor = peerDecor),
        ),
    )

    private fun show(conversation: ApiConversation, seen: MutableList<ServedProfileDecorItem?>, withGestures: Boolean = false) {
        val resolver = AvatarRingResolver { item -> seen += item; null }
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true, LocalAvatarRingResolver provides resolver) {
                MeeshyTheme {
                    ConversationRowContainer(
                        model = ConversationRowModel(
                            conversation = conversation,
                            currentUserId = "me",
                            currentUserPrefs = null,
                            peerUserId = "ali".takeIf { conversation.type == "direct" },
                            storyRing = StoryRingState.None,
                            moodEmoji = null,
                            draft = null,
                            typingDisplayName = null,
                            categories = emptyList(),
                            previewMessages = null,
                            isLocked = false,
                            nowMillis = 0L,
                        ),
                        actions = ConversationRowActions(
                            onClick = {},
                            onLoadPreview = {},
                            onAvatarTap = if (withGestures) ({}) else null,
                            onAvatarInfo = {},
                            onViewProfile = {},
                            onViewStory = {},
                            onMoodBadgeTap = {},
                            onMoodShown = {},
                        ),
                    )
                }
            }
        }
    }

    @Test
    fun `un direct dont le pair porte un contour le passe a l'avatar`() {
        val seen = mutableListOf<ServedProfileDecorItem?>()

        show(conversation("direct", decor), seen)
        compose.waitForIdle()

        assertThat(seen).contains(perle)
    }

    @Test
    fun `un groupe dont un membre porte un contour n'en montre aucun`() {
        val seen = mutableListOf<ServedProfileDecorItem?>()

        show(conversation("group", decor), seen)
        compose.waitForIdle()

        assertThat(seen.filterNotNull()).isEmpty()
        assertThat(seen).isNotEmpty()
    }

    @Test
    fun `un direct dont le pair n'a pas de contour n'en montre aucun`() {
        val seen = mutableListOf<ServedProfileDecorItem?>()

        show(conversation("direct", null), seen)
        compose.waitForIdle()

        assertThat(seen.filterNotNull()).isEmpty()
    }

    @Test
    fun `le contour est muet pour TalkBack, l'avatar garde un seul nom lu`() {
        val seen = mutableListOf<ServedProfileDecorItem?>()

        show(conversation("direct", decor), seen, withGestures = true)

        compose.onAllNodesWithTag(ROW_AVATAR_TEST_TAG).assertCountEquals(1)
        compose.onNodeWithTag(ROW_AVATAR_TEST_TAG).assertContentDescriptionContains("Ali")
    }
}
