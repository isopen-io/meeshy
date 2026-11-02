package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Port de `ConversationAvatarMenuTests.swift` : jamais de « double Voir le profil » sur un direct. */
class ConversationAvatarMenuTest {

    @Test
    fun `direct roles are conversation info then a single profile entry`() {
        val roles = ConversationAvatarMenu.directRoles()
        assertThat(roles).containsExactly(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.PROFILE).inOrder()
        assertThat(roles.count { it == AvatarMenuRole.PROFILE }).isEqualTo(1)
    }

    @Test
    fun `group roles never contain a profile entry and add the share link only when shareable`() {
        assertThat(ConversationAvatarMenu.groupRoles(canShare = false)).containsExactly(AvatarMenuRole.CONVERSATION_INFO)
        assertThat(ConversationAvatarMenu.groupRoles(canShare = true))
            .containsExactly(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.SHARE_LINK).inOrder()
        assertThat(ConversationAvatarMenu.groupRoles(canShare = true)).doesNotContain(AvatarMenuRole.PROFILE)
    }

    @Test
    fun `roles follow the conversation type`() {
        assertThat(ConversationAvatarMenu.rolesFor("direct", canShare = true)).isEqualTo(ConversationAvatarMenu.directRoles())
        listOf("group", "public", "global", "broadcast").forEach { type ->
            assertThat(ConversationAvatarMenu.rolesFor(type, canShare = true))
                .containsExactly(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.SHARE_LINK).inOrder()
            assertThat(ConversationAvatarMenu.rolesFor(type, canShare = false))
                .containsExactly(AvatarMenuRole.CONVERSATION_INFO)
        }
        assertThat(ConversationAvatarMenu.rolesFor("mystery", canShare = true)).containsExactly(AvatarMenuRole.CONVERSATION_INFO)
    }
}
