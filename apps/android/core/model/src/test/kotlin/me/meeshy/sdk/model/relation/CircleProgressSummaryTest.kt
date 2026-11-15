package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.FriendRequest
import org.junit.Test

/** Ce que la ligne d'un lien dit, et comment « Mes cercles » se range — iso `CircleProgressSummaryTests.swift` (#13938). */
class CircleProgressSummaryTest {

    private fun link(
        id: String = "u1",
        level: RelationLevel,
        eligibleFor: RelationLevel? = null,
        activeWeeks: Int = 0,
        needed: Int? = null,
        missing: List<String> = emptyList(),
    ) = RelationLink(id, level, level, null, RelationProgress(activeWeeks, needed, missing), eligibleFor)

    @Test
    fun `ce qui manque se dit d'abord, sans doublon, une nature inconnue se lit autre`() {
        val summary = CircleProgressSummary.of(link(level = RelationLevel.ACQUAINTANCE, missing = listOf("audio", "audio", "call")))

        assertThat(summary).isEqualTo(
            CircleProgressSummary.Missing(listOf(CircleProgressSummary.MissingPiece.AUDIO, CircleProgressSummary.MissingPiece.OTHER)),
        )
    }

    @Test
    fun `un cran ouvert se dit pret`() {
        assertThat(CircleProgressSummary.of(link(level = RelationLevel.FRIEND, eligibleFor = RelationLevel.CLOSE)))
            .isEqualTo(CircleProgressSummary.Eligible(RelationLevel.CLOSE))
    }

    @Test
    fun `une serie en cours se dit en semaines bornees a l'objectif`() {
        assertThat(CircleProgressSummary.of(link(level = RelationLevel.FRIEND, activeWeeks = 3, needed = 4)))
            .isEqualTo(CircleProgressSummary.Weeks(done = 3, needed = 4))
        assertThat(CircleProgressSummary.of(link(level = RelationLevel.CLOSE, activeWeeks = 20, needed = 12)))
            .isEqualTo(CircleProgressSummary.Weeks(done = 12, needed = 12))
    }

    @Test
    fun `un verrou sans objectif servi et le sommet ne disent rien`() {
        assertThat(CircleProgressSummary.of(link(level = RelationLevel.FRIEND))).isEqualTo(CircleProgressSummary.Silent)
        assertThat(CircleProgressSummary.of(link(level = RelationLevel.BLOOD))).isEqualTo(CircleProgressSummary.Silent)
    }

    @Test
    fun `les sections vont du plus proche au plus lointain, sans Public ni Communaute, triees par nom`() {
        val links = listOf(
            link("z", RelationLevel.FRIEND),
            link("p", RelationLevel.PUBLIC),
            link("c", RelationLevel.COMMUNITY),
            link("a", RelationLevel.FRIEND),
            link("b", RelationLevel.BLOOD),
        )
        val people = mapOf("z" to CirclePerson("z", "Alice"), "a" to CirclePerson("a", "Zoé"))

        val sections = CirclesLayout.sections(links, people)

        assertThat(sections.map { it.level }).containsExactly(RelationLevel.BLOOD, RelationLevel.FRIEND).inOrder()
        assertThat(sections.last().links.map { it.userId }).containsExactly("z", "a").inOrder()
    }

    @Test
    fun `seules les demandes en attente d'un lien liste sont des demandes de montee`() {
        val links = listOf(link("friend", RelationLevel.FRIEND), link("stranger", RelationLevel.PUBLIC))
        val received = listOf(
            FriendRequest(id = "1", senderId = "friend", status = "pending", targetLevel = "CLOSE"),
            FriendRequest(id = "2", senderId = "stranger", status = "pending"),
            FriendRequest(id = "3", senderId = "friend", status = "accepted"),
        )

        assertThat(CirclesLayout.raises(received, links, incoming = true).map { it.id }).containsExactly("1")
    }

    @Test
    fun `les quatre consentements voyagent toujours, refus compris`() {
        val encoded = Json.encodeToString(RelationRitualConsents.serializer(), RelationRitualConsents.ALL_REFUSED)

        assertThat(encoded).isEqualTo(
            """{"listeningTitle":false,"locationLive":false,"locationHistory":false,"locationProximity":false}""",
        )
        assertThat(RelationRitualConsents.ALL_REFUSED.setting(RelationRitualConsentKey.LOCATION_LIVE, true).isGranted(RelationRitualConsentKey.LOCATION_LIVE))
            .isTrue()
    }

    @Test
    fun `un etat de rituel inconnu se lit absent, un refus se lit sur son code`() {
        val json = Json { ignoreUnknownKeys = true }
        val progress = json.decodeFromString(RelationRitualProgressEvent.serializer(), """{"token":"t","userId":"u","stage":"dancing"}""")

        assertThat(progress.servedStage).isNull()
        assertThat(RelationRitualStage.of("lapsed")).isEqualTo(RelationRitualStage.LAPSED)
        assertThat(RelationRefusal.of("RELATION_RITUAL_LAPSED")).isEqualTo(RelationRefusal.RITUAL_LAPSED)
        assertThat(RelationRefusal.of("HTTP_409")).isNull()
    }

    @Test
    fun `la fiche ne propose que ce que le cercle ouvre`() {
        assertThat(CirclePersonSetting.offered(RelationLevel.ACQUAINTANCE)).isEmpty()
        assertThat(CirclePersonSetting.offered(RelationLevel.FRIEND)).containsExactly(CirclePersonSetting.BLOCK_BRING)
        assertThat(CirclePersonSetting.offered(RelationLevel.CLOSE))
            .containsExactly(CirclePersonSetting.BLOCK_BRING, CirclePersonSetting.TALKIE, CirclePersonSetting.LISTENING).inOrder()
        assertThat(CirclePersonSetting.offered(RelationLevel.BLOOD)).containsExactlyElementsIn(CirclePersonSetting.entries)
    }
}
