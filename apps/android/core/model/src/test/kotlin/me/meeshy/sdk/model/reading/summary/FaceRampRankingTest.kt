package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class FaceRampRankingTest {
    private val now = BASE

    private fun input(
        id: String, name: String, mentions: List<String> = emptyList(), replies: List<String> = emptyList(),
        questions: List<String> = emptyList(), recent: Instant? = null,
    ) = FaceRampRankingInput(id, name, null, "#31B6BA", PresenceState.OFFLINE, mentions, replies, questions, recent)

    private fun awaiting(id: String, kind: AwaitingKind, from: String, evidence: List<String>, at: Instant = now) =
        AwaitingItem(id, kind, from, evidence, at)

    @Test fun `poids identiques a iOS`() {
        assertThat(FaceRampRanking.MENTION_WEIGHT).isEqualTo(5.0)
        assertThat(FaceRampRanking.DIRECT_REPLY_WEIGHT).isEqualTo(3.0)
        assertThat(FaceRampRanking.UNANSWERED_QUESTION_WEIGHT).isEqualTo(2.0)
        assertThat(FaceRampRanking.RECENCY_WEIGHT).isEqualTo(1.0)
        assertThat(FaceRampRanking.RECENCY_HALF_LIFE.toDays()).isEqualTo(7)
    }

    @Test fun `Karim avec trois questions passe en premier`() {
        val ranked = FaceRampRanking.rank(
            listOf(input("u1", "Alice"), input("karim", "Karim", questions = listOf("q1", "q2", "q3")), input("u2", "Bob", replies = listOf("r1"))),
            now,
        )
        assertThat(ranked.first().id).isEqualTo("karim")
    }

    @Test fun `le badge est le nombre de preuves et non le score`() {
        val ranked = FaceRampRanking.rank(listOf(input("u1", "Alice", listOf("m1"), listOf("m2"), listOf("m3"))), now)
        assertThat(ranked[0].needScore).isEqualTo(10.0)
        assertThat(ranked[0].awaitingCount).isEqualTo(3)
    }

    @Test fun `une preuve partagee n est comptee qu une fois dans le badge`() {
        val ranked = FaceRampRanking.rank(listOf(input("u1", "Alice", listOf("m1"), questions = listOf("m1"))), now)
        assertThat(ranked[0].awaitingCount).isEqualTo(1)
        assertThat(ranked[0].evidenceMessageIds).containsExactly("m1")
    }

    @Test fun `egalite departagee par nom croissant`() {
        val ranked = FaceRampRanking.rank(listOf(input("z", "Zoé", listOf("m1")), input("a", "Adam", listOf("m2"))), now)
        assertThat(ranked.map { it.displayName }).containsExactly("Adam", "Zoé").inOrder()
    }

    @Test fun `entrees sans signal en dernier par ordre alphabetique`() {
        val ranked = FaceRampRanking.rank(
            listOf(input("k", "Karim", questions = listOf("q1")), input("z", "Zoé"), input("a", "Adam")), now,
        )
        assertThat(ranked.map { it.displayName }).containsExactly("Karim", "Adam", "Zoé").inOrder()
    }

    @Test fun `la recence vaut un demi a la demi-vie`() {
        val ranked = FaceRampRanking.rank(listOf(input("u", "A", recent = now.minus(FaceRampRanking.RECENCY_HALF_LIFE))), now)
        assertThat(ranked[0].needScore).isWithin(1e-4).of(0.5)
    }

    @Test fun `la recence vaut un maintenant, zero sans preuve, jamais negative dans le futur`() {
        assertThat(FaceRampRanking.rank(listOf(input("u", "A", recent = now)), now)[0].needScore).isWithin(1e-4).of(1.0)
        assertThat(FaceRampRanking.rank(listOf(input("u", "A")), now)[0].needScore).isEqualTo(0.0)
        assertThat(FaceRampRanking.rank(listOf(input("u", "A", recent = now.plusSeconds(3600))), now)[0].needScore)
            .isWithin(1e-4).of(1.0)
    }

    @Test fun `makeInputs groupe par expediteur et resout l identite`() {
        val inputs = FaceRampRanking.makeInputs(
            listOf(
                awaiting("a1", AwaitingKind.MENTION, "karim", listOf("m1")),
                awaiting("a2", AwaitingKind.UNANSWERED_QUESTION, "karim", listOf("m2"), now.plusSeconds(10)),
            ),
            listOf(participant("karim", "Karim", PresenceState.ONLINE)),
        )
        val karim = inputs.single()
        assertThat(karim.displayName).isEqualTo("Karim")
        assertThat(karim.mentionEvidence).containsExactly("m1")
        assertThat(karim.unansweredQuestionEvidence).containsExactly("m2")
        assertThat(karim.mostRecentEvidenceAt).isEqualTo(now.plusSeconds(10))
        assertThat(karim.presence).isEqualTo(PresenceState.ONLINE)
    }

    @Test fun `makeInputs ecarte un participant inconnu sans fabriquer d identite`() {
        assertThat(FaceRampRanking.makeInputs(listOf(awaiting("a1", AwaitingKind.MENTION, "ghost", listOf("m1"))), emptyList())).isEmpty()
    }

    @Test fun `de bout en bout Karim d abord avec trois preuves`() {
        val items = listOf(
            awaiting("a1", AwaitingKind.UNANSWERED_QUESTION, "karim", listOf("m1")),
            awaiting("a2", AwaitingKind.UNANSWERED_QUESTION, "karim", listOf("m2")),
            awaiting("a3", AwaitingKind.UNANSWERED_QUESTION, "karim", listOf("m3")),
            awaiting("a4", AwaitingKind.DIRECT_REPLY, "bob", listOf("m4")),
        )
        val ranked = FaceRampRanking.rank(
            FaceRampRanking.makeInputs(items, listOf(participant("karim", "Karim"), participant("bob", "Bob"))), now,
        )
        assertThat(ranked.first().displayName).isEqualTo("Karim")
        assertThat(ranked.first().awaitingCount).isEqualTo(3)
    }
}
