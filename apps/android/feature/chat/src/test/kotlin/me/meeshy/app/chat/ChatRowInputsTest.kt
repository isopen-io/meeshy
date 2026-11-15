package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import org.junit.Test

private const val DAY = 86_400_000L
private const val T0 = 1_780_000_000_000L

private fun row(
    id: String,
    sender: String? = "them",
    mine: Boolean = false,
    at: Long = T0,
    system: Boolean = false,
    deleted: Boolean = false,
) = ChatRowCandidate(id, sender, mine, at, system, deleted)

class ChatRowInputsTest {

    private val zone = ZoneOffset.UTC

    @Test
    fun `le dernier recu est le dernier message d'un autre auteur`() {
        val inputs = ChatRowInputs.of(listOf(row("a"), row("b", mine = true, sender = "me"), row("c")), zone)

        assertThat(inputs.filterValues { it.isLastReceived }.keys).containsExactly("c")
    }

    @Test
    fun `mes messages, les avis systeme et les supprimes ne sont jamais le dernier recu`() {
        val inputs = ChatRowInputs.of(
            listOf(row("a"), row("sys", system = true), row("del", deleted = true), row("mine", mine = true, sender = "me")),
            zone,
        )

        assertThat(inputs.filterValues { it.isLastReceived }.keys).containsExactly("a")
    }

    @Test
    fun `sans message recu personne ne porte le smiley d'ajout`() {
        val inputs = ChatRowInputs.of(listOf(row("m", mine = true, sender = "me")), zone)

        assertThat(inputs.values.none { it.isLastReceived }).isTrue()
    }

    @Test
    fun `une suite du meme auteur a une tete et une queue`() {
        val inputs = ChatRowInputs.of(listOf(row("a"), row("b"), row("c")), zone)

        assertThat(inputs.getValue("a").isFirstInGroup).isTrue()
        assertThat(inputs.getValue("a").isLastInGroup).isFalse()
        assertThat(inputs.getValue("b").isFirstInGroup).isFalse()
        assertThat(inputs.getValue("b").isLastInGroup).isFalse()
        assertThat(inputs.getValue("c").isFirstInGroup).isFalse()
        assertThat(inputs.getValue("c").isLastInGroup).isTrue()
    }

    @Test
    fun `un avis systeme coupe la suite de part et d'autre`() {
        val inputs = ChatRowInputs.of(listOf(row("a"), row("sys", system = true), row("b")), zone)

        assertThat(inputs.getValue("a").isLastInGroup).isTrue()
        assertThat(inputs.getValue("sys").isFirstInGroup).isTrue()
        assertThat(inputs.getValue("sys").isLastInGroup).isTrue()
        assertThat(inputs.getValue("b").isFirstInGroup).isTrue()
    }

    @Test
    fun `une suite ne traverse pas minuit`() {
        val inputs = ChatRowInputs.of(listOf(row("a", at = 0L), row("b", at = DAY)), zone)

        assertThat(inputs.getValue("a").isLastInGroup).isTrue()
        assertThat(inputs.getValue("b").isFirstInGroup).isTrue()
    }

    @Test
    fun `une liste vide ne donne aucune entree`() {
        assertThat(ChatRowInputs.of(emptyList(), zone)).isEmpty()
    }

    @Test
    fun `les destinataires en direct valent un`() {
        assertThat(ChatRowInputs.recipientCount(isDirect = true, serverRecipients = 9, memberCount = 9)).isEqualTo(1)
    }

    @Test
    fun `en groupe le compte servi l'emporte puis les autres membres`() {
        assertThat(ChatRowInputs.recipientCount(false, serverRecipients = 4, memberCount = 9)).isEqualTo(4)
        assertThat(ChatRowInputs.recipientCount(false, serverRecipients = 0, memberCount = 9)).isEqualTo(8)
        assertThat(ChatRowInputs.recipientCount(false, serverRecipients = 0, memberCount = null)).isEqualTo(1)
        assertThat(ChatRowInputs.recipientCount(false, serverRecipients = 0, memberCount = 1)).isEqualTo(1)
    }
}
