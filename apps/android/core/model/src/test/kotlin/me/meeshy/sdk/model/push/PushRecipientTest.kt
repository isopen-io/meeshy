package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13567 : un push nomme son destinataire ; seul le compte connecté qu'il nomme le reçoit. */
class PushRecipientTest {

    @Test
    fun `la charge decode le destinataire nomme par la passerelle`() {
        val payload = PushPayload.decode(mapOf("recipientUserId" to "user-a"))

        assertThat(payload.recipientUserId).isEqualTo("user-a")
    }

    @Test
    fun `un push qui nomme le compte connecte lui est destine`() {
        assertThat(PushRecipient.of(recipientUserId = "user-a", signedInUserId = "user-a")).isEqualTo(PushRecipient.SELF)
    }

    @Test
    fun `un push qui nomme un autre compte que celui connecte est etranger`() {
        assertThat(PushRecipient.of(recipientUserId = "user-a", signedInUserId = "user-b")).isEqualTo(PushRecipient.FOREIGN)
    }

    @Test
    fun `un push qui nomme un compte alors que personne n'est connecte est etranger`() {
        assertThat(PushRecipient.of(recipientUserId = "user-a", signedInUserId = null)).isEqualTo(PushRecipient.FOREIGN)
    }

    @Test
    fun `un push d'une passerelle anterieure, sans destinataire, garde le comportement d'avant`() {
        assertThat(PushRecipient.of(recipientUserId = null, signedInUserId = "user-b")).isEqualTo(PushRecipient.UNNAMED)
    }
}
