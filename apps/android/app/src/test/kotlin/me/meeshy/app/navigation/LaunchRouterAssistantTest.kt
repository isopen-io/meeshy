package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AssistantDeepLink
import org.junit.Test

/** Ce que la racine fait des liens que l'assistant, les raccourcis et les widgets émettent. */
class LaunchRouterAssistantTest {
    private fun action(link: String?) = DeepLinkRouter.action(link!!)

    @Test
    fun `recent opens the most recent conversation and unread the unread list`() {
        assertThat(action(AssistantDeepLink.recentConversation())).isEqualTo(DeepLinkAction.OpenRecentConversation)
        assertThat(action(AssistantDeepLink.unreadConversations())).isEqualTo(DeepLinkAction.OpenUnreadConversations)
    }

    @Test
    fun `send opens the direct conversation with the untruncated draft and sends nothing`() {
        assertThat(action(AssistantDeepLink.send("c1", "Tom & Jerry ce soir")))
            .isEqualTo(DeepLinkAction.OpenDraft("c1", "Tom & Jerry ce soir"))
    }

    @Test
    fun `call is a request handled by the call host, never an automatic call`() {
        assertThat(action(AssistantDeepLink.call("c1", isVideo = true))).isEqualTo(DeepLinkAction.HandledAtLaunch)
    }

    @Test
    fun `the root owns the list entries and the send draft`() {
        assertThat(DeepLinkRouter.ownsLink(AssistantDeepLink.recentConversation())).isTrue()
        assertThat(DeepLinkRouter.ownsLink(AssistantDeepLink.unreadConversations())).isTrue()
    }
}
