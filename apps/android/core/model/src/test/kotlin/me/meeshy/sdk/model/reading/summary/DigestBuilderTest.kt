package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DigestBuilderTest {
    private val viewer = "viewer"

    private fun build(
        messages: List<DigestInputMessage>,
        participants: List<DigestParticipant> = emptyList(),
        episodes: List<ConversationEpisode> = emptyList(),
        complete: Boolean = true,
    ) = DeterministicDigestBuilder.build(messages, participants, viewer, episodes, complete)

    @Test fun `fenetre vide donne un digest vide et transmet isComplete`() {
        val digest = build(emptyList(), complete = false)
        assertThat(digest.messageCount).isEqualTo(0)
        assertThat(digest.start).isNull()
        assertThat(digest.awaitingYou).isEmpty()
        assertThat(digest.isComplete).isFalse()
    }

    @Test fun `isComplete est transmis tel quel meme avec des donnees`() {
        val messages = listOf(digestMsg("m1", "u1", 0))
        assertThat(build(messages, complete = true).isComplete).isTrue()
        assertThat(build(messages, complete = false).isComplete).isFalse()
    }

    @Test fun `les messages systeme sont exclus du compte`() {
        val digest = build(
            listOf(digestMsg("m1", "u1", 0), digestMsg("m2", "u2", 10), digestMsg("s", "system", 20, system = true)),
        )
        assertThat(digest.messageCount).isEqualTo(2)
    }

    @Test fun `participantCount compte les expediteurs distincts sans roster`() {
        val digest = build(listOf(digestMsg("m1", "u1", 0), digestMsg("m2", "u2", 10), digestMsg("m3", "u1", 20)))
        assertThat(digest.participantCount).isEqualTo(2)
    }

    @Test fun `avec un roster un expediteur fantome n est pas une personne mais son message compte`() {
        val digest = build(
            listOf(digestMsg("m1", "u1", 0), digestMsg("m2", "ghost", 10)),
            participants = listOf(participant("u1")),
        )
        assertThat(digest.participantCount).isEqualTo(1)
        assertThat(digest.messageCount).isEqualTo(2)
    }

    @Test fun `topSenders tri par compte puis par identifiant`() {
        val digest = build(
            listOf(
                digestMsg("m1", "uB", 0), digestMsg("m2", "uA", 10), digestMsg("m3", "uA", 20),
                digestMsg("m4", "uC", 30), digestMsg("m5", "uC", 40),
            ),
        )
        assertThat(digest.topSenders.map { it.userId }).containsExactly("uA", "uC", "uB").inOrder()
        assertThat(digest.topSenders[0].messageCount).isEqualTo(2)
        assertThat(digest.topSenders[0].lastAt).isEqualTo(BASE.plusSeconds(20))
    }

    @Test fun `langues ignorent nul et vide`() {
        val digest = build(
            listOf(
                digestMsg("m1", "u1", 0, language = "fr"), digestMsg("m2", "u2", 10, language = "en"),
                digestMsg("m3", "u1", 20, language = "fr"), digestMsg("m4", "u3", 30, language = null),
                digestMsg("m5", "u3", 40, language = ""),
            ),
        )
        assertThat(digest.languages.first()).isEqualTo(LanguageTally("fr", 2))
        assertThat(digest.languages.sumOf { it.messageCount }).isEqualTo(3)
    }

    @Test fun `medias six compartiments reels`() {
        val digest = build(
            listOf(
                digestMsg("m1", "u1", 0, media = listOf(DigestMediaKind.IMAGE, DigestMediaKind.IMAGE), links = 1),
                digestMsg(
                    "m2", "u2", 10,
                    media = listOf(DigestMediaKind.VIDEO, DigestMediaKind.AUDIO, DigestMediaKind.FILE, DigestMediaKind.LOCATION),
                ),
            ),
        )
        assertThat(digest.media).isEqualTo(MediaTally(images = 2, videos = 1, audios = 1, files = 1, locations = 1, links = 1))
    }

    @Test fun `mention sans reponse produit une ligne avec preuve`() {
        val item = build(listOf(digestMsg("m1", "other", 0, mentionsViewer = true))).awaitingYou.single()
        assertThat(item.kind).isEqualTo(AwaitingKind.MENTION)
        assertThat(item.fromUserId).isEqualTo("other")
        assertThat(item.evidenceMessageIds).containsExactly("m1")
    }

    @Test fun `mention suivie d une reponse du lecteur n attend plus`() {
        val digest = build(listOf(digestMsg("m1", "other", 0, mentionsViewer = true), digestMsg("m2", viewer, 10)))
        assertThat(digest.awaitingYou).isEmpty()
    }

    @Test fun `reponse directe a un message du lecteur attend`() {
        val digest = build(listOf(digestMsg("m1", viewer, 0), digestMsg("m2", "other", 10, reply = "m1")))
        assertThat(digest.awaitingYou.single().kind).isEqualTo(AwaitingKind.DIRECT_REPLY)
    }

    @Test fun `reponse a un tiers n est pas une reponse directe`() {
        val digest = build(listOf(digestMsg("m1", "o1", 0), digestMsg("m2", "o2", 10, reply = "m1")))
        assertThat(digest.awaitingYou).isEmpty()
    }

    @Test fun `question finissant par point d interrogation attend meme avec espaces`() {
        val digest = build(listOf(digestMsg("m1", "other", 0, content = "Tu viens quand ?  \n")))
        assertThat(digest.awaitingYou.single().kind).isEqualTo(AwaitingKind.UNANSWERED_QUESTION)
    }

    @Test fun `question anterieure au dernier message du lecteur n attend plus`() {
        val digest = build(listOf(digestMsg("m1", "other", 0, content = "Ok ?"), digestMsg("m2", viewer, 5)))
        assertThat(digest.awaitingYou).isEmpty()
    }

    @Test fun `les messages du lecteur ne l attendent jamais`() {
        val digest = build(listOf(digestMsg("m1", viewer, 0, content = "Une question ?", mentionsViewer = true)))
        assertThat(digest.awaitingYou).isEmpty()
    }

    @Test fun `un message peut etre mention et question avec des lignes distinctes`() {
        val digest = build(listOf(digestMsg("m1", "other", 0, content = "@moi ?", mentionsViewer = true)))
        assertThat(digest.awaitingYou.map { it.kind })
            .containsExactly(AwaitingKind.MENTION, AwaitingKind.UNANSWERED_QUESTION)
        assertThat(digest.awaitingYou.all { it.evidenceMessageIds.isNotEmpty() }).isTrue()
    }

    @Test fun `episodes transmis tels quels`() {
        val episode = ConversationEpisode("e1", BASE, BASE, listOf("m1"), listOf("u1"), EpisodeTitle(DayLabel.Relative(DayLabelKey.TODAY), null, 1))
        assertThat(build(listOf(digestMsg("m1", "u1", 0)), episodes = listOf(episode)).episodes).containsExactly(episode)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `AwaitingItem sans preuve est refuse a la construction`() {
        AwaitingItem("x", AwaitingKind.MENTION, "u", emptyList(), BASE)
    }

    @Test fun `AwaitingItem of rend null sans preuve`() {
        assertThat(AwaitingItem.of("x", AwaitingKind.MENTION, "u", emptyList(), BASE)).isNull()
    }
}
