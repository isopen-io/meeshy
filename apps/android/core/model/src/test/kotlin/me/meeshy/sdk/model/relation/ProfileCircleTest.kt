package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import org.junit.Test

/** Le profil montre le niveau COMMUN servi, rien d'inventé (#13940) — iso `ProfileCircleViewModelTests.swift`. */
class ProfileCircleTest {

    private fun link(userId: String, level: RelationLevel, eligibleFor: RelationLevel? = null) =
        RelationLink(userId, level, level, eligibleFor = eligibleFor)

    @Test
    fun `le profil montre le niveau commun de cette personne seule`() {
        val circle = ProfileCircle.of("a", listOf(link("b", RelationLevel.BLOOD), link("a", RelationLevel.CLOSE)), emptyList())

        assertThat(circle?.level).isEqualTo(RelationLevel.CLOSE)
    }

    @Test
    fun `sans lien servi, ou sous Connaissance, rien n'est invente`() {
        assertThat(ProfileCircle.of("a", listOf(link("b", RelationLevel.FRIEND)), emptyList())).isNull()
        assertThat(ProfileCircle.of("a", listOf(link("a", RelationLevel.COMMUNITY)), emptyList())).isNull()
    }

    @Test
    fun `le cran suivant ne se propose que s'il est ouvert`() {
        assertThat(ProfileCircle.of("a", listOf(link("a", RelationLevel.FRIEND)), emptyList())?.offeredRaise).isNull()
        assertThat(ProfileCircle.of("a", listOf(link("a", RelationLevel.FRIEND, RelationLevel.CLOSE)), emptyList())?.offeredRaise)
            .isEqualTo(RelationLevel.CLOSE)
        assertThat(ProfileCircle.of("a", listOf(link("a", RelationLevel.ACQUAINTANCE)), emptyList())?.offeredRaise)
            .isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `une demande deja envoyee se lit en attente et ne se repropose pas`() {
        val sent = listOf(FriendRequest(id = "s", receiverId = "a", status = "pending", targetLevel = "CLOSE"))

        val circle = ProfileCircle.of("a", listOf(link("a", RelationLevel.FRIEND, RelationLevel.CLOSE)), sent)

        assertThat(circle?.pending).isEqualTo(RelationLevel.CLOSE)
        assertThat(circle?.offeredRaise).isNull()
    }
}
