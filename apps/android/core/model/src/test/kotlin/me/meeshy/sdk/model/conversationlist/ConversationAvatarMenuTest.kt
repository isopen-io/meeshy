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

/** #15887 : les rôles suivent ce qu'ouvre l'avatar — un direct sans profil à montrer n'offre pas « Voir le profil ». */
class ConversationAvatarMenuRolesTest {

    @Test
    fun `un direct qui ouvre un profil offre infos puis profil`() {
        assertThat(ConversationAvatarMenu.roles("direct", opensProfile = true, hasShareAction = true))
            .containsExactly(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.PROFILE).inOrder()
    }

    @Test
    fun `un direct sans profil a montrer n'offre que les infos`() {
        assertThat(ConversationAvatarMenu.roles("direct", opensProfile = false, hasShareAction = true))
            .containsExactly(AvatarMenuRole.CONVERSATION_INFO)
        assertThat(ConversationAvatarMenu.roles("dm", opensProfile = false, hasShareAction = false))
            .containsExactly(AvatarMenuRole.CONVERSATION_INFO)
    }

    @Test
    fun `un groupe partageable offre le lien seulement si l'hote sait le fabriquer`() {
        listOf("group", "public", "global", "broadcast").forEach { type ->
            assertThat(ConversationAvatarMenu.roles(type, opensProfile = false, hasShareAction = true))
                .containsExactly(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.SHARE_LINK).inOrder()
            assertThat(ConversationAvatarMenu.roles(type, opensProfile = false, hasShareAction = false))
                .containsExactly(AvatarMenuRole.CONVERSATION_INFO)
        }
        assertThat(ConversationAvatarMenu.roles("community", opensProfile = true, hasShareAction = true))
            .containsExactly(AvatarMenuRole.CONVERSATION_INFO)
    }
}
