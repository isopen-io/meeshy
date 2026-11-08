package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationBackgroundPlanTest {
    private fun plan(
        type: String? = "direct",
        encryptionMode: String? = null,
        memberCount: Int = 2,
        topLanguages: List<String> = emptyList(),
    ) = ConversationBackgroundPlan.of(type, encryptionMode, memberCount, topLanguages)

    @Test
    fun `chaque type de conversation a sa composition de base`() {
        assertThat(plan("direct").style).isEqualTo(ConversationBackgroundPlan.Style.INTIMATE)
        assertThat(plan("bot").style).isEqualTo(ConversationBackgroundPlan.Style.INTIMATE)
        assertThat(plan("group").style).isEqualTo(ConversationBackgroundPlan.Style.GROUP)
        assertThat(plan("community").style).isEqualTo(ConversationBackgroundPlan.Style.COMMUNITY)
        listOf("public", "global", "channel", "broadcast").forEach {
            assertThat(plan(it).style).isEqualTo(ConversationBackgroundPlan.Style.GLOBAL)
        }
    }

    @Test
    fun `un type inconnu ou absent retombe sur l'intimiste et la casse est ignoree`() {
        assertThat(plan(null).style).isEqualTo(ConversationBackgroundPlan.Style.INTIMATE)
        assertThat(plan("mystere").style).isEqualTo(ConversationBackgroundPlan.Style.INTIMATE)
        assertThat(plan("GROUP").style).isEqualTo(ConversationBackgroundPlan.Style.GROUP)
    }

    @Test
    fun `tout mode de chiffrement ouvre la surcouche et seul e2ee la marque bout en bout`() {
        assertThat(plan(encryptionMode = null).encryption).isEqualTo(ConversationBackgroundPlan.Encryption.NONE)
        assertThat(plan(encryptionMode = "server").encryption).isEqualTo(ConversationBackgroundPlan.Encryption.SERVER)
        assertThat(plan(encryptionMode = "e2ee").encryption).isEqualTo(ConversationBackgroundPlan.Encryption.END_TO_END)
    }

    @Test
    fun `les drapeaux apparaissent des trois langues`() {
        assertThat(plan(topLanguages = listOf("fr", "en")).flags).isEmpty()
        assertThat(plan(topLanguages = listOf("fr", "en", "es")).flags).hasSize(3)
    }

    @Test
    fun `les drapeaux sont bornes a dix et connus ou drapeau blanc`() {
        val many = listOf("fr", "en", "es", "de", "pt", "it", "zh", "ja", "ko", "ar", "ru", "hi")
        assertThat(plan(topLanguages = many).flags).hasSize(10)
        assertThat(plan(topLanguages = listOf("fr", "en", "xx")).flags)
            .containsExactly("🇫🇷", "🇬🇧", "🏳️").inOrder()
    }

    @Test
    fun `les avatars du groupe suivent la moitie des membres entre deux et huit`() {
        assertThat(plan("group", memberCount = 1).avatarCount).isEqualTo(2)
        assertThat(plan("group", memberCount = 8).avatarCount).isEqualTo(4)
        assertThat(plan("group", memberCount = 500).avatarCount).isEqualTo(8)
    }

    @Test
    fun `le badge compte les membres non figures`() {
        assertThat(plan("group", memberCount = 8).hiddenMembers).isEqualTo(4)
        assertThat(plan("group", memberCount = 500).hiddenMembers).isEqualTo(492)
        assertThat(plan("group", memberCount = 2).hiddenMembers).isEqualTo(0)
    }
}
