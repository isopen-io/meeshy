package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

/**
 * Port de `ConversationAvatarTargetTests.swift` (#15887) : toucher l'avatar d'une ligne ouvre
 * TOUJOURS quelque chose — le profil du pair d'une directe quand on peut le montrer, sinon les
 * détails de la conversation. Jamais rien, jamais le fil.
 */
class ConversationAvatarTargetTest {

    private val peerId = "6ad65e870d750c3615db0597"

    private fun resolve(
        type: String?,
        peer: String? = peerId,
        blocked: Boolean = false,
        closed: Boolean = false,
        anonymous: Boolean = false,
    ) = ConversationAvatarTarget.resolve(
        type = type,
        peerUserId = peer,
        peerBlocked = blocked,
        peerAccountClosed = closed,
        peerAnonymous = anonymous,
    )

    private fun direct(peer: ApiParticipant) = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(ApiParticipant(id = "p-me", userId = "me"), peer),
    )

    @Test
    fun `un direct au pair inscrit ouvre le profil du pair`() {
        assertThat(resolve("direct")).isEqualTo(ConversationAvatarTarget.Profile(peerId))
        assertThat(resolve("direct").opensProfile).isTrue()
        assertThat(resolve("dm")).isEqualTo(ConversationAvatarTarget.Profile(peerId))
    }

    @Test
    fun `un direct sans identifiant de pair montre les details`() {
        assertThat(resolve("direct", peer = null)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        assertThat(resolve("direct", peer = "")).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        assertThat(resolve("direct", peer = null).opensProfile).isFalse()
    }

    @Test
    fun `un pair bloque, ferme ou anonyme montre les details`() {
        assertThat(resolve("direct", blocked = true)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        assertThat(resolve("direct", closed = true)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        assertThat(resolve("direct", blocked = true, closed = true)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        assertThat(resolve("direct", anonymous = true)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
    }

    @Test
    fun `tout autre type montre les details, meme avec un pair residuel`() {
        listOf("group", "public", "global", "community", "channel", "bot", "broadcast", null, "mystery").forEach { type ->
            assertThat(resolve(type)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
            assertThat(resolve(type, peer = null)).isEqualTo(ConversationAvatarTarget.ConversationInfo)
        }
    }

    @Test
    fun `la projection de la conversation lit son pair elu, sa fermeture et son type`() {
        val open = direct(ApiParticipant(id = "p-peer", userId = peerId))
        assertThat(open.avatarTarget(readerId = "me", isPeerBlocked = false))
            .isEqualTo(ConversationAvatarTarget.Profile(peerId))
        assertThat(open.avatarTarget(readerId = "me", isPeerBlocked = true))
            .isEqualTo(ConversationAvatarTarget.ConversationInfo)

        val closed = direct(ApiParticipant(id = "p-peer", userId = peerId, accountClosed = true))
        assertThat(closed.avatarTarget(readerId = "me", isPeerBlocked = false))
            .isEqualTo(ConversationAvatarTarget.ConversationInfo)

        val anonymous = direct(ApiParticipant(id = "p-peer", userId = peerId, type = "anonymous"))
        assertThat(anonymous.avatarTarget(readerId = "me", isPeerBlocked = false))
            .isEqualTo(ConversationAvatarTarget.ConversationInfo)
    }

    @Test
    fun `un lecteur inconnu n'elit personne et montre les details`() {
        val open = direct(ApiParticipant(id = "p-peer", userId = peerId))
        assertThat(open.avatarTarget(readerId = null, isPeerBlocked = false))
            .isEqualTo(ConversationAvatarTarget.ConversationInfo)
    }

    @Test
    fun `une conversation verrouillee passe la porte du code puis montre les details, profil compris`() {
        val profile = ConversationAvatarTarget.Profile(peerId)
        assertThat(ConversationAvatarRoute.route(profile, isLocked = true)).isEqualTo(ConversationAvatarRoute.UnlockThenInfo)
        assertThat(ConversationAvatarRoute.route(ConversationAvatarTarget.ConversationInfo, isLocked = true))
            .isEqualTo(ConversationAvatarRoute.UnlockThenInfo)
        assertThat(ConversationAvatarRoute.UnlockThenInfo.opensProfile).isFalse()
    }

    @Test
    fun `une conversation ouverte suit la cible`() {
        assertThat(ConversationAvatarRoute.route(ConversationAvatarTarget.Profile(peerId), isLocked = false))
            .isEqualTo(ConversationAvatarRoute.Profile(peerId))
        assertThat(ConversationAvatarRoute.route(ConversationAvatarTarget.Profile(peerId), isLocked = false).opensProfile)
            .isTrue()
        assertThat(ConversationAvatarRoute.route(ConversationAvatarTarget.ConversationInfo, isLocked = false))
            .isEqualTo(ConversationAvatarRoute.Info)
    }
}
