package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageSenderIdentityTest {

    private fun sender(type: String?, username: String = "bob", name: String? = "Bob") =
        ApiMessageSender(id = "p1", userId = "u1", username = username, displayName = name, type = type)

    private fun resolve(
        sender: ApiMessageSender?,
        isMe: Boolean = false,
        session: MessageSenderIdentity.Session? = null,
    ) = MessageSenderIdentity.resolve(sender, MessageSourceKind.User, isMe, session)

    @Test
    fun `un invite de type anonymous est anonyme et sans compte`() {
        val identity = resolve(sender("anonymous"))
        assertThat(identity.isAnonymous).isTrue()
        assertThat(identity.hasAccount).isFalse()
    }

    @Test
    fun `un inscrit dont le pseudo ressemble a ano_ garde son identite`() {
        val identity = resolve(sender("user", username = "ano_bob"))
        assertThat(identity.isAnonymous).isFalse()
        assertThat(identity.hasAccount).isTrue()
    }

    @Test
    fun `un type absent ou inconnu vaut invite sans compte`() {
        assertThat(resolve(sender(null)).hasAccount).isFalse()
        assertThat(resolve(sender("alien")).hasAccount).isFalse()
    }

    @Test
    fun `mon echo allege reprend l'identite de ma session`() {
        val identity = resolve(null, isMe = true, session = MessageSenderIdentity.Session("Moi", "moi"))
        assertThat(identity.name).isEqualTo("Moi")
        assertThat(identity.username).isEqualTo("moi")
        assertThat(identity.hasAccount).isTrue()
    }

    @Test
    fun `le repli de session ne devine jamais le nom d'un autre`() {
        val identity = resolve(null, isMe = false, session = MessageSenderIdentity.Session("Moi", "moi"))
        assertThat(identity.name).isNull()
        assertThat(identity.username).isNull()
    }

    @Test
    fun `le nom servi l'emporte sur la session`() {
        val identity = resolve(sender("user"), isMe = true, session = MessageSenderIdentity.Session("Moi", "moi"))
        assertThat(identity.name).isEqualTo("Bob")
        assertThat(identity.username).isEqualTo("bob")
    }
}
