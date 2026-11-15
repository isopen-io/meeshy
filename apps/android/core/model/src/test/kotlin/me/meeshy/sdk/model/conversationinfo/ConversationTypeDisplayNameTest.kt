package me.meeshy.sdk.model.conversationinfo

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le type de fil dit à la fiche (iOS `conversation.type.displayName` + `conversationTypeIcon`). */
class ConversationTypeDisplayNameTest {

    @Test
    fun `chaque type servi retrouve son genre`() {
        assertThat(ConversationTypeKind.of("direct")).isEqualTo(ConversationTypeKind.DIRECT)
        assertThat(ConversationTypeKind.of("group")).isEqualTo(ConversationTypeKind.GROUP)
        assertThat(ConversationTypeKind.of("public")).isEqualTo(ConversationTypeKind.PUBLIC)
        assertThat(ConversationTypeKind.of("global")).isEqualTo(ConversationTypeKind.GLOBAL)
        assertThat(ConversationTypeKind.of("community")).isEqualTo(ConversationTypeKind.COMMUNITY)
        assertThat(ConversationTypeKind.of("channel")).isEqualTo(ConversationTypeKind.CHANNEL)
        assertThat(ConversationTypeKind.of("broadcast")).isEqualTo(ConversationTypeKind.BROADCAST)
        assertThat(ConversationTypeKind.of("bot")).isEqualTo(ConversationTypeKind.BOT)
    }

    @Test
    fun `dm vaut direct et la casse ne compte pas`() {
        assertThat(ConversationTypeKind.of("DM")).isEqualTo(ConversationTypeKind.DIRECT)
        assertThat(ConversationTypeKind.of("Group")).isEqualTo(ConversationTypeKind.GROUP)
    }

    @Test
    fun `un type inconnu ou absent se lit comme un groupe`() {
        assertThat(ConversationTypeKind.of("zzz")).isEqualTo(ConversationTypeKind.GROUP)
        assertThat(ConversationTypeKind.of(null)).isEqualTo(ConversationTypeKind.GROUP)
    }

    @Test
    fun `seul un direct se passe de banniere`() {
        assertThat(ConversationTypeKind.DIRECT.hasHeroBanner).isFalse()
        assertThat(ConversationTypeKind.entries.filter { it != ConversationTypeKind.DIRECT }.all { it.hasHeroBanner }).isTrue()
    }
}
