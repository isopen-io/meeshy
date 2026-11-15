package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination
import org.junit.Test

class RootIntentRouterTest {

    @Test
    fun `un payload tardif est rejoue une seule fois puis efface`() {
        val inbox = PendingIntentInbox<String>()
        inbox.post("push-1")
        assertThat(inbox.take(isAuthenticated = true)).isEqualTo("push-1")
        assertThat(inbox.take(isAuthenticated = true)).isNull()
        assertThat(inbox.hasPending).isFalse()
    }

    @Test
    fun `hors session le payload reste en attente jusqu'a la connexion`() {
        val inbox = PendingIntentInbox<String>()
        inbox.post("push-1")
        assertThat(inbox.take(isAuthenticated = false)).isNull()
        assertThat(inbox.hasPending).isTrue()
        assertThat(inbox.take(isAuthenticated = true)).isEqualTo("push-1")
    }

    @Test
    fun `seules les URL de partage passent par le routeur de navigation`() {
        assertThat(RootIntentRouting.handlerFor(DeepLinkDestination.Share(text = "salut", url = null)))
            .isEqualTo(RootIntentRouting.LinkHandler.NAVIGATION_ROUTER)
        listOf(
            DeepLinkDestination.JoinLink("abc"),
            DeepLinkDestination.ChatLink("abc"),
            DeepLinkDestination.Conversation("c1"),
            DeepLinkDestination.MagicLink("t"),
            DeepLinkDestination.Post("p1"),
        ).forEach {
            assertThat(RootIntentRouting.handlerFor(it)).isEqualTo(RootIntentRouting.LinkHandler.LINK_PARSER)
        }
    }

    @Test
    fun `la navigation par id porte le message a surligner`() {
        val action = RootIntentRouting.plan(RootIntent.OpenConversation("c1", "m9"), isAuthenticated = true)
        assertThat(action).isEqualTo(RootIntentAction.NavigateToConversation("c1", "m9"))
    }

    @Test
    fun `un message a surligner vide est ignore`() {
        val action = RootIntentRouting.plan(RootIntent.OpenConversation("c1", " "), isAuthenticated = true)
        assertThat(action).isEqualTo(RootIntentAction.NavigateToConversation("c1", null))
    }

    @Test
    fun `sendMessageToUser ouvre la conversation directe`() {
        val action = RootIntentRouting.plan(RootIntent.SendMessageToUser("u1", "alice"), isAuthenticated = true)
        assertThat(action).isEqualTo(RootIntentAction.OpenDirectConversation("u1", "alice"))
        assertThat(RootIntentRouting.plan(RootIntent.SendMessageToUser(""), isAuthenticated = true))
            .isEqualTo(RootIntentAction.Ignore)
    }

    @Test
    fun `openProfileSheet retombe sur l'identifiant sans nom d'utilisateur`() {
        val action = RootIntentRouting.plan(RootIntent.OpenProfileSheet("u1"), isAuthenticated = true)
        assertThat(action).isEqualTo(RootIntentAction.ShowProfileSheet("u1", "u1"))
    }

    @Test
    fun `openStoryComposer ouvre le composeur de story`() {
        assertThat(RootIntentRouting.plan(RootIntent.OpenStoryComposer, isAuthenticated = true))
            .isEqualTo(RootIntentAction.ShowStoryComposer)
    }

    @Test
    fun `pushNavigateToRoute navigue vers la route sauf si elle est vide`() {
        assertThat(RootIntentRouting.plan(RootIntent.PushNavigateToRoute("settings"), isAuthenticated = true))
            .isEqualTo(RootIntentAction.NavigateToRoute("settings"))
        assertThat(RootIntentRouting.plan(RootIntent.PushNavigateToRoute(""), isAuthenticated = true))
            .isEqualTo(RootIntentAction.Ignore)
    }

    @Test
    fun `hors session toute intention est ignoree`() {
        assertThat(RootIntentRouting.plan(RootIntent.OpenStoryComposer, isAuthenticated = false))
            .isEqualTo(RootIntentAction.Ignore)
    }
}
