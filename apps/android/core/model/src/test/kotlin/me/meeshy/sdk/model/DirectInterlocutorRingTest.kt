package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.presence.withoutServedPresence
import org.junit.Test

/**
 * #15984 (miroir d'iOS `DirectInterlocutor.wearingInterlocutor` et de `LentilleConversationRow` :
 * `ring: isDirect ? conversation.participantRing : nil`) — le contour d'une ligne est celui du PAIR en direct,
 * jamais celui du lecteur, jamais celui d'un membre d'un groupe.
 */
class DirectInterlocutorRingTest {

    private fun ring(item: String) = ServedProfileDecorItem(pack = "contours-essentiels", item = item, origin = PackOrigin.BUILTIN)

    private fun decor(item: String) = ServedProfileDecor(avatarRing = ring(item))

    private val reader = ApiParticipant(id = "p1", userId = "me", displayName = "Moi", profileDecor = decor("anneau-du-lecteur"))
    private val peer = ApiParticipant(id = "p2", userId = "ali", displayName = "Ali", profileDecor = decor("perle"))

    private fun direct(type: String = "direct", vararg participants: ApiParticipant) =
        ApiConversation(id = "c", type = type, participants = participants.toList())

    @Test
    fun `un direct porte le contour du pair, jamais celui du lecteur`() {
        assertThat(direct("direct", reader, peer).displayedAvatarRing("me")).isEqualTo(ring("perle"))
        assertThat(direct("direct", peer, reader).displayedAvatarRing("me")).isEqualTo(ring("perle"))
    }

    @Test
    fun `le type dm se lit comme un direct`() {
        assertThat(direct("dm", reader, peer).displayedAvatarRing("me")).isEqualTo(ring("perle"))
    }

    @Test
    fun `un groupe ne porte jamais le contour d'un membre`() {
        assertThat(direct("group", reader, peer).displayedAvatarRing("me")).isNull()
    }

    @Test
    fun `un lecteur inconnu n'elit personne donc ne montre aucun contour`() {
        val conversation = direct("direct", reader, peer)

        assertThat(conversation.displayedAvatarRing(null)).isNull()
        assertThat(conversation.displayedAvatarRing("")).isNull()
    }

    @Test
    fun `un pair sans decor ni contour ne montre rien`() {
        assertThat(direct("direct", reader, peer.copy(profileDecor = null)).displayedAvatarRing("me")).isNull()
        assertThat(direct("direct", reader, peer.copy(profileDecor = ServedProfileDecor.EMPTY)).displayedAvatarRing("me")).isNull()
    }

    @Test
    fun `une ligne servie sans participants garde le contour que le cache connaissait`() {
        val connue = direct("direct", reader, peer)
        val servie = ApiConversation(id = "c", type = "direct")

        assertThat(servie.keepingParticipantsOf(connue).displayedAvatarRing("me")).isEqualTo(ring("perle"))
    }

    @Test
    fun `le cache sans presence garde le contour`() {
        val enCache = direct("direct", reader, peer.copy(isOnline = true, lastActiveAt = "2026-11-04T10:00:00Z")).withoutServedPresence()

        assertThat(enCache.displayedAvatarRing("me")).isEqualTo(ring("perle"))
    }
}
