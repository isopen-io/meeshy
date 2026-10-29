package me.meeshy.app.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.AvatarPresenceDotTestTag
import me.meeshy.ui.component.LocalConversationViewers
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le point « ici » d'un pair qui REGARDE la conversation (#13744) sur les surfaces de la
 * conversation : l'en-tête, la feuille d'infos et la liste des membres. Rien n'est fabriqué :
 * sans annonce du serveur pour CE pair dans CETTE conversation, aucun point.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatHereSurfacesTest {

    @get:Rule
    val compose = createComposeRule()

    private val viewers = MutableStateFlow(ConversationViewers())

    private fun arrive(userId: String, conversationId: String = "c1") {
        viewers.value = viewers.value.applying(ViewingEvent.Arrived(ViewingChange(userId, conversationId)))
        compose.waitForIdle()
    }

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalConversationViewers provides viewers,
                    LocalReduceMotion provides true,
                ) { content() }
            }
        }
    }

    private fun assertHereDots(count: Int) =
        compose.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(count)

    @Test
    fun `the header avatar shows the dot of the peer who is here`() {
        show {
            ChatHeaderAvatar(
                name = "Ana",
                door = ChatHeaderAvatarDoor.PROFILE,
                accentColor = MeeshyPalette.Indigo500,
                imageUrl = null,
                presence = null,
                here = me.meeshy.ui.component.rememberConversationHere("peer", "c1"),
                isUser = true,
                onOpenProfile = {},
                onOpenDetails = {},
                onToggle = {},
            )
        }
        assertHereDots(0)
        arrive("peer")
        assertHereDots(1)
    }

    @Test
    fun `the header avatar speaks the here it is given`() {
        show {
            ChatHeaderAvatar(
                name = "Ana",
                door = ChatHeaderAvatarDoor.PROFILE,
                accentColor = MeeshyPalette.Indigo500,
                imageUrl = null,
                presence = null,
                here = ConversationHere.ACTIVE,
                isUser = true,
                onOpenProfile = {},
                onOpenDetails = {},
                onToggle = {},
            )
        }
        assertHereDots(1)
    }

    @Test
    fun `the info sheet avatar lights up for the direct peer who is here, in this conversation only`() {
        show { ConversationInfoAvatar(title = "Ana", accentColor = MeeshyPalette.Indigo500, avatarUrl = null, peerUserId = "peer", conversationId = "c1") }
        assertHereDots(0)
        arrive("peer", "c2")
        assertHereDots(0)
        arrive("peer", "c1")
        assertHereDots(1)
    }

    @Test
    fun `a group info sheet has no peer so no dot`() {
        show { ConversationInfoAvatar(title = "Team", accentColor = MeeshyPalette.Indigo500, avatarUrl = null, peerUserId = null, conversationId = "c1") }
        arrive("peer")
        assertHereDots(0)
    }

    private fun row(member: PaginatedParticipant, isSelf: Boolean = false) = show {
        MemberRow(
            member = member,
            conversationId = "c1",
            isSelf = isSelf,
            accentColor = MeeshyPalette.Indigo500,
            roleActions = emptyList(),
            canRemove = false,
            canBan = false,
            onRoleAction = {},
            onRemove = {},
            onBan = {},
            onOpenProfile = {},
        )
    }

    @Test
    fun `a member who is here has his dot in the members list`() {
        row(PaginatedParticipant(id = "p1", userId = "u1", username = "ana"))
        assertHereDots(0)
        arrive("u1")
        assertHereDots(1)
    }

    @Test
    fun `my own row never gets a dot`() {
        row(PaginatedParticipant(id = "p-me", userId = "me", username = "moi"), isSelf = true)
        arrive("me")
        assertHereDots(0)
    }
}
