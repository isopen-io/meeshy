package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Port de `ConversationAvatarSpeech` (iOS #15887) : ce que TalkBack dit et propose sur l'avatar d'une ligne. */
class ConversationAvatarSpeechTest {

    @Test
    fun `l'avatar qui ouvre un profil se dit profil, tout autre se dit details, verrou compris`() {
        assertThat(ConversationAvatarSpeech.labelKind(ConversationAvatarRoute.Profile("u1")))
            .isEqualTo(ConversationAvatarLabelKind.PROFILE)
        assertThat(ConversationAvatarSpeech.labelKind(ConversationAvatarRoute.Info))
            .isEqualTo(ConversationAvatarLabelKind.DETAILS)
        assertThat(ConversationAvatarSpeech.labelKind(ConversationAvatarRoute.UnlockThenInfo))
            .isEqualTo(ConversationAvatarLabelKind.DETAILS)
    }

    @Test
    fun `les actions sont les entrees du menu dans leur ordre, puis la story`() {
        val roles = listOf(AvatarMenuRole.CONVERSATION_INFO, AvatarMenuRole.PROFILE)
        assertThat(ConversationAvatarSpeech.actions(roles, hasStory = true)).containsExactly(
            ConversationAvatarA11yAction.Menu(AvatarMenuRole.CONVERSATION_INFO),
            ConversationAvatarA11yAction.Menu(AvatarMenuRole.PROFILE),
            ConversationAvatarA11yAction.ViewStory,
        ).inOrder()
        assertThat(ConversationAvatarSpeech.actions(roles, hasStory = false)).containsExactly(
            ConversationAvatarA11yAction.Menu(AvatarMenuRole.CONVERSATION_INFO),
            ConversationAvatarA11yAction.Menu(AvatarMenuRole.PROFILE),
        ).inOrder()
    }
}
