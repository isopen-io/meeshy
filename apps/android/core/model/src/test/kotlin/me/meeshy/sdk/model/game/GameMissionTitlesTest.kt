package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMissionTitlesTest {

    @Test
    fun `les gabarits jumeaux partagent la meme phrase`() {
        assertThat(GameMissionTitles.title("send-voice", 3).key).isEqualTo(GameMissionTitles.title("duo-voice", 3).key)
        assertThat(GameMissionTitles.title("reply-conversations", 2).key)
            .isEqualTo(GameTextKey.MissionWriteConversations)
        assertThat(GameMissionTitles.title("gold-reply-conversations", 2).key)
            .isEqualTo(GameTextKey.MissionWriteConversations)
    }

    @Test
    fun `la cible voyage comme un entier`() {
        assertThat(GameMissionTitles.title("send-texts", 12).args).containsExactly(GameTextArg.Count(12))
    }

    @Test
    fun `un gabarit sans forme singuliere garde une seule phrase`() {
        assertThat(GameMissionTitles.title("duo-replies", 1).key).isEqualTo(GameTextKey.MissionReplyConversations)
        assertThat(GameMissionTitles.title("long-chat", 50).key).isEqualTo(GameTextKey.MissionLongChat)
    }

    @Test
    fun `un gabarit inconnu reste un acte du reve`() {
        assertThat(GameMissionTitles.title("template-du-futur", 4)).isEqualTo(GameText(GameTextKey.MissionGeneric))
    }

    @Test
    fun `chaque gabarit connu rend une cle de mission`() {
        GameMissionTitles.knownTemplates.forEach { template ->
            assertThat(GameMissionTitles.title(template, 2).key.name).startsWith("Mission")
            assertThat(GameMissionTitles.title(template, 2).key).isNotEqualTo(GameTextKey.MissionGeneric)
        }
        assertThat(GameMissionTitles.knownTemplates.size).isAtLeast(30)
    }
}
