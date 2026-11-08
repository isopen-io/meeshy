package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageSourceKindTest {

    @Test
    fun `les six sources sont reconnues sans tenir compte de la casse`() {
        assertThat(MessageSourceKind.parse("system")).isEqualTo(MessageSourceKind.System)
        assertThat(MessageSourceKind.parse("ADS")).isEqualTo(MessageSourceKind.Ads)
        assertThat(MessageSourceKind.parse("App")).isEqualTo(MessageSourceKind.App)
        assertThat(MessageSourceKind.parse("agent")).isEqualTo(MessageSourceKind.Agent)
        assertThat(MessageSourceKind.parse("authority")).isEqualTo(MessageSourceKind.Authority)
        assertThat(MessageSourceKind.parse("user")).isEqualTo(MessageSourceKind.User)
    }

    @Test
    fun `absent ou inconnu vaut utilisateur`() {
        assertThat(MessageSourceKind.parse(null)).isEqualTo(MessageSourceKind.User)
        assertThat(MessageSourceKind.parse("robot")).isEqualTo(MessageSourceKind.User)
    }

    @Test
    fun `seul un message system ne se groupe jamais avec le voisin`() {
        MessageSourceKind.entries.forEach {
            assertThat(it.groupsWithNeighbour).isEqualTo(it != MessageSourceKind.System)
        }
    }

    @Test
    fun `hasAccount se deduit de la source quand l'expediteur manque`() {
        val agent = MessageSenderIdentity.resolve(null, MessageSourceKind.Agent, isMe = false)
        val user = MessageSenderIdentity.resolve(null, MessageSourceKind.User, isMe = false)
        assertThat(agent.hasAccount).isTrue()
        assertThat(user.hasAccount).isFalse()
    }
}
