package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InviteLandingStateTest {
    private val now = 1_000_000L

    private fun info(
        creator: ShareLinkCreator? = ShareLinkCreator(username = "priya", firstName = "Priya", lastName = "N"),
        conversation: ShareLinkConversation? = ShareLinkConversation(id = "c", title = "Les voisins", type = "group", createdAt = "2026-03-01T10:00:00.000Z"),
        stats: ShareLinkStats? = ShareLinkStats(totalParticipants = 12, languageCount = 3, spokenLanguages = listOf("fr", "en", "ko")),
        description: String? = "  Viens !  ",
    ) = ShareLinkInfo(id = "1", linkId = "abc", description = description, creator = creator, conversation = conversation, stats = stats)

    @Test
    fun `l'invitant garde son prenom et un message rogne`() {
        val inviter = InviteLandingState.from(info(), now).inviter!!
        assertThat(inviter.firstName).isEqualTo("Priya")
        assertThat(inviter.username).isEqualTo("priya")
        assertThat(inviter.message).isEqualTo("Viens !")
    }

    @Test
    fun `sans prenom on prend le premier mot du nom puis le pseudo`() {
        val named = ShareLinkCreator(username = "u", displayName = "Jean Paul")
        assertThat(InviteLandingState.from(info(creator = named), now).inviter!!.firstName).isEqualTo("Jean")
        val bare = ShareLinkCreator(username = "solo")
        assertThat(InviteLandingState.from(info(creator = bare), now).inviter!!.firstName).isEqualTo("solo")
    }

    @Test
    fun `un message blanc fait disparaitre la bulle`() {
        assertThat(InviteLandingState.from(info(description = "   "), now).inviter!!.message).isNull()
        assertThat(InviteLandingState.from(info(description = null), now).inviter!!.message).isNull()
    }

    @Test
    fun `sans createur aucune section invitant`() {
        assertThat(InviteLandingState.from(info(creator = null), now).inviter).isNull()
    }

    @Test
    fun `les six types de conversation sont reconnus`() {
        val kinds = listOf("direct", "group", "public", "global", "community", "channel", "autre", "GROUP")
            .map { InviteGroupKind.from(it) }
        assertThat(kinds).containsExactly(
            InviteGroupKind.DIRECT, InviteGroupKind.GROUP, InviteGroupKind.PUBLIC, InviteGroupKind.GLOBAL,
            InviteGroupKind.COMMUNITY, InviteGroupKind.CHANNEL, InviteGroupKind.OTHER, InviteGroupKind.GROUP,
        ).inOrder()
    }

    @Test
    fun `le groupe porte titre type date adresse`() {
        val group = InviteLandingState.from(info(), now).group!!
        assertThat(group.title).isEqualTo("Les voisins")
        assertThat(group.kind).isEqualTo(InviteGroupKind.GROUP)
        assertThat(group.createdAt).isEqualTo(1_772_359_200_000L)
        assertThat(group.address.path).isEqualTo("/chat/abc")
    }

    @Test
    fun `un titre blanc est absent et une date illisible aussi`() {
        val conv = ShareLinkConversation(id = "c", title = "  ", type = "public", createdAt = "hier")
        val group = InviteLandingState.from(info(conversation = conv), now).group!!
        assertThat(group.title).isNull()
        assertThat(group.createdAt).isNull()
    }

    @Test
    fun `les effectifs nuls ne s'affichent jamais`() {
        val facts = InviteLandingState.from(info(stats = ShareLinkStats()), now).facts
        assertThat(facts.people).isNull()
        assertThat(facts.languages).isNull()
        assertThat(facts.isEmpty).isTrue()
    }

    @Test
    fun `le nombre de langues prend le plus grand de la stat et de la liste`() {
        val stats = ShareLinkStats(totalParticipants = 2, languageCount = 1, spokenLanguages = listOf("fr", "en"))
        val facts = InviteLandingState.from(info(stats = stats), now).facts
        assertThat(facts.languages).isEqualTo(2)
        assertThat(facts.people).isEqualTo(2)
        assertThat(facts.shares.map { it.code }).containsExactly("fr", "en")
    }
}
