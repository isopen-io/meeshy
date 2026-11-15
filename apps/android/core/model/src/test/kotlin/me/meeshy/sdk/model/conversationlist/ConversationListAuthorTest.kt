package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import org.junit.Test

class ConversationListAuthorTest {

    private fun resolve(
        senderId: String? = "p-bob",
        senderUserId: String? = null,
        served: PreviewFieldUpdate<String> = PreviewFieldUpdate.Unchanged,
        reader: String? = "me",
        eventMessageId: String? = null,
        rowMessageId: String? = null,
        rowSenderName: String? = null,
    ) = ConversationListAuthor.resolve(
        eventSenderId = senderId,
        eventSenderUserId = senderUserId,
        eventSenderName = served,
        readerId = reader,
        youLabel = "Toi",
        eventMessageId = eventMessageId,
        rowMessageId = rowMessageId,
        rowSenderName = rowSenderName,
    )

    @Test fun `mon message se dit Toi meme quand seul le userId le prouve`() {
        assertThat(resolve(senderId = "p-me", senderUserId = "me", served = PreviewFieldUpdate.Replaced("Moi Même")))
            .isEqualTo(ConversationListAuthor.Resolution.Display("Toi"))
    }

    @Test fun `un lecteur inconnu ne fait jamais dire Toi`() {
        assertThat(resolve(senderId = null, reader = null)).isEqualTo(ConversationListAuthor.Resolution.Unchanged)
    }

    @Test fun `Toi est tenu sur le meme message`() {
        assertThat(
            resolve(served = PreviewFieldUpdate.Replaced("Alice"), eventMessageId = "m1", rowMessageId = "m1", rowSenderName = "Toi"),
        ).isEqualTo(ConversationListAuthor.Resolution.Unchanged)
    }

    @Test fun `le nom servi est une affirmation y compris vide`() {
        assertThat(resolve(served = PreviewFieldUpdate.Replaced("  Bob "))).isEqualTo(ConversationListAuthor.Resolution.Display("Bob"))
        assertThat(resolve(served = PreviewFieldUpdate.Replaced(null))).isEqualTo(ConversationListAuthor.Resolution.Display(null))
        assertThat(resolve(served = PreviewFieldUpdate.Replaced(" "))).isEqualTo(ConversationListAuthor.Resolution.Display(null))
    }

    @Test fun `rien de dit reste inchange`() {
        assertThat(resolve()).isEqualTo(ConversationListAuthor.Resolution.Unchanged)
        assertThat(ConversationListAuthor.Resolution.Unchanged.nameForNewMessage).isNull()
    }

    @Test fun `name dit Toi pour le lecteur et le nom servi sinon`() {
        assertThat(ConversationListAuthor.name("me", "Moi", "me", "Toi")).isEqualTo("Toi")
        assertThat(ConversationListAuthor.name("bob", "Bob", "me", "Toi")).isEqualTo("Bob")
        assertThat(ConversationListAuthor.name("bob", "Bob", null, "Toi")).isEqualTo("Bob")
    }

    @Test fun `peerUserId ne suit que le nom d'un pair`() {
        assertThat(ConversationListAuthor.peerUserId("bob", "Bob", "me", "Toi")).isEqualTo("bob")
        assertThat(ConversationListAuthor.peerUserId("me", "Toi", "me", "Toi")).isNull()
        assertThat(ConversationListAuthor.peerUserId("bob", null, "me", "Toi")).isNull()
        assertThat(ConversationListAuthor.peerUserId("", "Bob", "me", "Toi")).isNull()
    }
}
