package me.meeshy.sdk.model.guest

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AnonymousJoinResponse
import me.meeshy.sdk.model.AnonymousParticipant
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.JoinedConversation
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.toSessionContext
import me.meeshy.sdk.model.world.LinkMembershipResponse
import org.junit.Test

/** Les termes de pieces jointes d'un lien suivent la session de l'invite, du serveur jusqu'au composeur. */
class GuestAttachmentTermsTest {
    private fun join(kinds: List<String>?) = AnonymousJoinResponse(
        sessionToken = "t",
        participant = AnonymousParticipant(id = "p", canSendMessages = true, canSendFiles = true, canSendImages = true),
        conversation = JoinedConversation(id = "c", allowedAttachmentKinds = kinds),
        linkId = "l",
    )

    @Test
    fun `les familles servies a l adhesion deviennent l allowance de la session`() {
        val context = join(listOf("text", "audio")).toSessionContext()!!
        assertThat(context.attachmentAllowance.kinds).containsExactly(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO)
    }

    @Test
    fun `un lien sans termes ne restreint rien`() {
        assertThat(join(null).toSessionContext()!!.attachmentAllowance.isRestricted).isFalse()
    }

    @Test
    fun `un lien dont les termes sont inconnus n ouvre rien`() {
        assertThat(join(listOf("hologram")).toSessionContext()!!.attachmentAllowance).isEqualTo(GuestAttachmentAllowance.CLOSED)
    }

    @Test
    fun `World Wide plafonne ses invites au texte et a l audio`() {
        val context = LinkMembershipResponse(sessionToken = "t", conversationId = "c", participantId = "p").toSessionContext("k")!!
        assertThat(context.attachmentAllowance.kinds).containsExactlyElementsIn(GuestAttachmentKind.WORLD_GUEST_CEILING)
    }

    @Test
    fun `une session enregistree avant ce champ se relit sans restriction`() {
        val old = """{"sessionToken":"t","participantId":"p","permissions":{},"linkId":"l","conversationId":"c"}"""
        val context = Json { ignoreUnknownKeys = true }.decodeFromString(AnonymousSessionContext.serializer(), old)
        assertThat(context.attachmentAllowance.isRestricted).isFalse()
        assertThat(context.permissions).isEqualTo(ParticipantPermissions())
    }
}
