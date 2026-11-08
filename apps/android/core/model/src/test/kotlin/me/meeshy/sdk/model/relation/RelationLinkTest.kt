package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.FriendRequest
import org.junit.Test

/** Un lien servi par `GET /relations` (#13933), lu comme iOS le lit (`RelationLinkTests.swift`, #13938). */
class RelationLinkTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private fun decode(raw: String): List<RelationLink> =
        json.decodeFromString(ListSerializer(RelationLinkWire.serializer()), raw).map(RelationLinkWire::toLink)

    private fun link(
        level: RelationLevel,
        eligibleFor: RelationLevel? = null,
        activeWeeks: Int = 0,
        needed: Int? = null,
        missing: List<String> = emptyList(),
    ) = RelationLink(
        userId = "u1",
        effectiveLevel = level,
        grantedByMe = level,
        progress = RelationProgress(activeWeeks, needed, missing),
        eligibleFor = eligibleFor,
    )

    @Test
    fun `un lien complet se lit tel que le serveur le sert`() {
        val served = decode(
            """[{"userId":"u1","effectiveLevel":"FRIEND","grantedByMe":"CLOSE","since":"2026-10-01T00:00:00Z",
               "progress":{"activeWeeks":3,"needed":4,"missing":[]},"eligibleFor":null}]""",
        ).single()

        assertThat(served).isEqualTo(
            RelationLink(
                userId = "u1",
                effectiveLevel = RelationLevel.FRIEND,
                grantedByMe = RelationLevel.CLOSE,
                since = "2026-10-01T00:00:00Z",
                progress = RelationProgress(activeWeeks = 3, needed = 4),
                eligibleFor = null,
            ),
        )
    }

    @Test
    fun `un niveau inconnu se lit Public, jamais plus haut, et une eligibilite Public se lit absente`() {
        val served = decode("""[{"userId":"u1","effectiveLevel":"ATOM","grantedByMe":"MOON","eligibleFor":"PUBLIC"}]""").single()

        assertThat(served.effectiveLevel).isEqualTo(RelationLevel.PUBLIC)
        assertThat(served.grantedByMe).isEqualTo(RelationLevel.PUBLIC)
        assertThat(served.eligibleFor).isNull()
    }

    @Test
    fun `un bloc de progression absent ou incomplet ne fait pas tomber le lien`() {
        val served = decode("""[{"userId":"a","effectiveLevel":"CLOSE"},{"userId":"b","effectiveLevel":"FRIEND","progress":{"needed":4}}]""")

        assertThat(served.map { it.progress }).containsExactly(RelationProgress(), RelationProgress(0, 4, emptyList())).inOrder()
    }

    @Test
    fun `le cache relit exactement le lien qu'il a ecrit`() {
        val original = link(RelationLevel.CLOSE, eligibleFor = RelationLevel.BLOOD, activeWeeks = 12, needed = 12, missing = listOf("audio"))

        assertThat(original.toWire().toLink()).isEqualTo(original)
    }

    @Test
    fun `Connaissance vers Ami est toujours proposable`() {
        assertThat(link(RelationLevel.ACQUAINTANCE).raiseOffer()).isEqualTo(RelationRaiseOffer.Available(RelationLevel.FRIEND))
    }

    @Test
    fun `Ami vers Proche reste verrouille tant que la serie n'est pas servie comme atteinte`() {
        assertThat(link(RelationLevel.FRIEND).raiseOffer()).isEqualTo(RelationRaiseOffer.Locked(RelationLevel.CLOSE))
        assertThat(link(RelationLevel.FRIEND, eligibleFor = RelationLevel.CLOSE).raiseOffer())
            .isEqualTo(RelationRaiseOffer.Available(RelationLevel.CLOSE))
    }

    @Test
    fun `le Sang est le sommet`() {
        assertThat(link(RelationLevel.BLOOD).raiseOffer()).isEqualTo(RelationRaiseOffer.None)
    }

    @Test
    fun `une demande sans cran vise Ami, une demande illisible n'invente aucun cran`() {
        assertThat(FriendRequest(id = "r", targetLevel = null).requestedLevel).isEqualTo(RelationLevel.FRIEND)
        assertThat(FriendRequest(id = "r", targetLevel = "BLOOD").requestedLevel).isEqualTo(RelationLevel.BLOOD)
        assertThat(FriendRequest(id = "r", targetLevel = "ATOM").requestedLevel).isNull()
    }

    @Test
    fun `une demande servie avec son cran le garde au decodage`() {
        val request = json.decodeFromString(FriendRequest.serializer(), """{"id":"r","status":"pending","targetLevel":"CLOSE"}""")

        assertThat(request.requestedLevel).isEqualTo(RelationLevel.CLOSE)
    }
}
