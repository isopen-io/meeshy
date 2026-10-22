package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #11615 (miroir de `DirectInterlocutorTests.swift`, #11164) — un direct porte le nom,
 * l'avatar et le pseudo de l'AUTRE participant, élu contre l'identifiant du LECTEUR.
 *
 * Un lecteur inconnu n'élit personne : « celui qui n'est pas le lecteur » serait sinon le
 * premier participant servi, le plus souvent le lecteur lui-même (le créateur du direct), et
 * la ligne se lirait sous son propre nom.
 */
class DirectInterlocutorTest {

    private val reader = participant(id = "p-reader", userId = "u-reader", displayName = "Moi", avatar = "/me.webp")
    private val peer = participant(id = "p-peer", userId = "u-peer", displayName = "Mc", avatar = "/mc.webp")

    private fun participant(
        id: String,
        userId: String?,
        displayName: String? = null,
        username: String? = null,
        avatar: String? = null,
    ) = ApiParticipant(id = id, userId = userId, displayName = displayName, username = username, avatar = avatar)

    private fun direct(
        participants: List<ApiParticipant> = listOf(reader, peer),
        type: String = "direct",
        title: String? = null,
        lastMessage: ApiConversationLastMessage? = null,
    ) = ApiConversation(
        id = "c1",
        type = type,
        title = title,
        participants = participants,
        lastMessage = lastMessage,
    )

    // MARK: l'élection

    @Test
    fun `un lecteur connu elit l'autre participant meme servi en second`() {
        val elected = direct(participants = listOf(reader, peer)).interlocutor(readerId = "u-reader")

        assertThat(elected?.userId).isEqualTo("u-peer")
        assertThat(elected?.name).isEqualTo("Mc")
        assertThat(elected?.avatarUrl).isEqualTo("/mc.webp")
    }

    @Test
    fun `un lecteur connu elit l'autre participant meme servi en premier`() {
        val elected = direct(participants = listOf(peer, reader)).interlocutor(readerId = "u-reader")

        assertThat(elected?.userId).isEqualTo("u-peer")
    }

    @Test
    fun `un lecteur inconnu n'elit personne`() {
        val conversation = direct(participants = listOf(reader, peer))

        assertThat(conversation.interlocutor(readerId = null)).isNull()
        assertThat(conversation.interlocutor(readerId = "")).isNull()
        assertThat(conversation.interlocutor(readerId = "   ")).isNull()
    }

    @Test
    fun `plusieurs participants servis elisent le premier qui n'est pas le lecteur`() {
        val third = participant(id = "p-third", userId = "u-third", displayName = "Zoe")
        val elected = direct(participants = listOf(reader, peer, third)).interlocutor(readerId = "u-reader")

        assertThat(elected?.userId).isEqualTo("u-peer")
    }

    @Test
    fun `un participant sans compte n'est jamais elu`() {
        val ghost = participant(id = "p-ghost", userId = null, displayName = "Ghost")

        assertThat(direct(participants = listOf(reader, ghost)).interlocutor(readerId = "u-reader")).isNull()
    }

    @Test
    fun `seul un direct elit un interlocuteur`() {
        listOf("group", "community", "channel", "bot", "public", "global", "broadcast").forEach { type ->
            assertThat(direct(type = type).interlocutor(readerId = "u-reader")).isNull()
        }
    }

    @Test
    fun `dm et la casse du type designent aussi un direct`() {
        assertThat(direct(type = "dm").isDirect).isTrue()
        assertThat(direct(type = "DIRECT").isDirect).isTrue()
        assertThat(direct(type = "group").isDirect).isFalse()
    }

    @Test
    fun `le nom et le pseudo de l'interlocuteur viennent de la meme election`() {
        val named = participant(id = "p", userId = "u-peer", displayName = "  ", username = "mc_user")

        val elected = direct(participants = listOf(reader, named)).interlocutor(readerId = "u-reader")

        assertThat(elected?.name).isEqualTo("mc_user")
        assertThat(elected?.username).isEqualTo("mc_user")
    }

    // MARK: le nom d'un direct

    @Test
    fun `le nom d'un direct est celui de l'interlocuteur elu`() {
        assertThat(direct().directName(readerId = "u-reader")).isEqualTo("Mc")
    }

    @Test
    fun `un direct n'affiche jamais le titre stocke`() {
        // Artefact du legacy : « X et Y » nomme aussi le lecteur.
        val legacy = direct(participants = listOf(reader, peer), title = "Moi et Mc")

        assertThat(legacy.directName(readerId = "u-reader")).isEqualTo("Mc")
        assertThat(legacy.directName(readerId = null)).isEqualTo(DIRECT_GENERIC_NAME)
        assertThat(direct(participants = emptyList(), title = "Moi et Mc").directName("u-reader"))
            .isEqualTo(DIRECT_GENERIC_NAME)
    }

    @Test
    fun `un lecteur inconnu ne nomme pas la ligne d'apres le lecteur`() {
        val name = direct(participants = listOf(reader, peer)).directName(readerId = null)

        assertThat(name).isNotEqualTo("Moi")
        assertThat(name).isEqualTo(DIRECT_GENERIC_NAME)
    }

    @Test
    fun `sans participant servi le nom retombe sur l'expediteur du dernier message quand ce n'est pas le lecteur`() {
        val lastFromPeer = ApiConversationLastMessage(id = "m1", senderId = "p-peer", senderName = "Mc")
        val known = direct(participants = emptyList(), lastMessage = lastFromPeer)

        val name = resolveDirectName(
            interlocutor = null,
            lastSender = DirectLastSender(userId = "u-peer", name = "Mc"),
            readerId = "u-reader",
        )

        assertThat(name).isEqualTo("Mc")
        assertThat(known.directName(readerId = "u-reader")).isEqualTo(DIRECT_GENERIC_NAME)
    }

    @Test
    fun `l'expediteur du dernier message est resolu par la table des participants`() {
        val lastFromPeer = ApiConversationLastMessage(id = "m1", senderId = "p-peer", senderName = "Mc")
        val conversation = direct(participants = listOf(peer), lastMessage = lastFromPeer)

        assertThat(conversation.lastSenderOrNull()).isEqualTo(DirectLastSender(userId = "u-peer", name = "Mc"))
    }

    @Test
    fun `un expediteur dont l'identite de compte est inconnue ne nomme jamais la ligne`() {
        // `senderId` est un id de PARTICIPANT : sans la table des participants, rien ne dit
        // que cet expéditeur n'est pas le lecteur — le générique est plus honnête que son nom.
        val lastFromSomeone = ApiConversationLastMessage(id = "m1", senderId = "p-unknown", senderName = "Quelqu'un")
        val conversation = direct(participants = emptyList(), lastMessage = lastFromSomeone)

        assertThat(conversation.lastSenderOrNull()?.userId).isNull()
        assertThat(conversation.directName(readerId = "u-reader")).isEqualTo(DIRECT_GENERIC_NAME)
    }

    @Test
    fun `le repli expediteur n'est jamais le lecteur ni un lecteur inconnu`() {
        val fromReader = DirectLastSender(userId = "u-reader", name = "Moi")
        val fromPeer = DirectLastSender(userId = "u-peer", name = "Mc")

        assertThat(resolveDirectName(null, fromReader, readerId = "u-reader")).isEqualTo(DIRECT_GENERIC_NAME)
        assertThat(resolveDirectName(null, fromPeer, readerId = null)).isEqualTo(DIRECT_GENERIC_NAME)
        assertThat(resolveDirectName(null, fromPeer, readerId = "")).isEqualTo(DIRECT_GENERIC_NAME)
        assertThat(resolveDirectName(null, DirectLastSender("u-peer", name = " "), readerId = "u-reader"))
            .isEqualTo(DIRECT_GENERIC_NAME)
    }

    @Test
    fun `l'interlocuteur elu prime sur l'expediteur du dernier message`() {
        val elected = DirectInterlocutor(participant = peer, userId = "u-peer")
        val other = DirectLastSender(userId = "u-third", name = "Zoe")

        assertThat(resolveDirectName(elected, other, readerId = "u-reader")).isEqualTo("Mc")
    }

    @Test
    fun `sans aucune information le nom est generique`() {
        assertThat(resolveDirectName(null, null, readerId = "u-reader")).isEqualTo(DIRECT_GENERIC_NAME)
    }

    // MARK: le report de l'election depuis le cache

    @Test
    fun `une ligne servie sans participants garde ceux que le cache connait`() {
        val served = direct(participants = emptyList())
        val known = direct(participants = listOf(reader, peer))

        val merged = served.keepingParticipantsOf(known)

        assertThat(merged.participants).containsExactly(reader, peer).inOrder()
        assertThat(merged.directName(readerId = "u-reader")).isEqualTo("Mc")
    }

    @Test
    fun `une ligne servie qui ne nomme que le lecteur garde les participants du cache`() {
        val served = direct(participants = listOf(reader))
        val known = direct(participants = listOf(reader, peer))

        assertThat(served.keepingParticipantsOf(known).participants).containsExactly(reader, peer).inOrder()
    }

    @Test
    fun `une ligne servie qui nomme deux personnes n'est pas remplacee par le cache`() {
        val renamedPeer = peer.copy(displayName = "Mc Renomme")
        val served = direct(participants = listOf(reader, renamedPeer))
        val known = direct(participants = listOf(reader, peer))

        assertThat(served.keepingParticipantsOf(known)).isEqualTo(served)
    }

    @Test
    fun `le report ne concerne ni les groupes ni un cache qui ne sait rien`() {
        val servedGroup = direct(type = "group", participants = emptyList())
        val knownGroup = direct(type = "group", participants = listOf(reader, peer))
        val served = direct(participants = emptyList())

        assertThat(servedGroup.keepingParticipantsOf(knownGroup)).isEqualTo(servedGroup)
        assertThat(served.keepingParticipantsOf(null)).isEqualTo(served)
        assertThat(served.keepingParticipantsOf(direct(participants = listOf(reader)))).isEqualTo(served)
    }

    // MARK: la demande de creation

    @Test
    fun `la creation d'un direct n'a ni titre ni autre participant que l'interlocuteur`() {
        val request = directConversationRequest(userId = "u-peer")

        assertThat(request.type).isEqualTo("direct")
        assertThat(request.title).isNull()
        assertThat(request.participantIds).containsExactly("u-peer")
    }
}
