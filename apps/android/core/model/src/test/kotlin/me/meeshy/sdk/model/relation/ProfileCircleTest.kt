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

/** Rétrograder d'un cran, ou annuler le lien à Connaissance (#14910) — iso la spec commune. */
class ProfileCircleLoweringTest {

    private fun circle(level: RelationLevel, granted: RelationLevel = level, eligibleFor: RelationLevel? = null) =
        ProfileCircle(RelationLink("a", level, granted, eligibleFor = eligibleFor))

    @Test
    fun `on descend d'un seul cran sous le niveau effectif, et a Connaissance on annule le lien`() {
        assertThat(circle(RelationLevel.BLOOD).lowering).isEqualTo(RelationLevel.CLOSE)
        assertThat(circle(RelationLevel.CLOSE).lowering).isEqualTo(RelationLevel.FRIEND)
        assertThat(circle(RelationLevel.FRIEND).lowering).isEqualTo(RelationLevel.ACQUAINTANCE)
        assertThat(circle(RelationLevel.ACQUAINTANCE).lowering).isEqualTo(RelationLevel.PUBLIC)
    }

    @Test
    fun `le cran vise part du niveau EFFECTIF, pas de mon accord plus haut`() {
        assertThat(circle(RelationLevel.FRIEND, granted = RelationLevel.BLOOD).lowering).isEqualTo(RelationLevel.ACQUAINTANCE)
    }

    @Test
    fun `l'instantane optimiste prend le cran vise, et l'annulation retire le cercle`() {
        val lowered = circle(RelationLevel.CLOSE, eligibleFor = RelationLevel.BLOOD).copy(pending = RelationLevel.BLOOD).lowered()

        assertThat(lowered?.level).isEqualTo(RelationLevel.FRIEND)
        assertThat(lowered?.link?.grantedByMe).isEqualTo(RelationLevel.FRIEND)
        assertThat(lowered?.pending).isNull()
        assertThat(lowered?.offeredRaise).isNull()
        assertThat(circle(RelationLevel.ACQUAINTANCE).lowered()).isNull()
    }

    @Test
    fun `un cool-down servi masque Promouvoir`() {
        val open = circle(RelationLevel.FRIEND, eligibleFor = RelationLevel.CLOSE)

        assertThat(open.offeredRaise).isEqualTo(RelationLevel.CLOSE)
        assertThat(open.copy(raiseBlocked = true).offeredRaise).isNull()
    }
}

/** Le verrou de remontée que `GET /relations/:userId` sert (#14910) : absent = comportement d'avant. */
class RelationRaiseGateTest {

    private val now = java.time.Instant.parse("2026-11-03T12:00:00Z").toEpochMilli()

    @Test
    fun `sans champ servi rien n'est bloque`() {
        assertThat(RelationRaiseGate().blocks(now)).isFalse()
    }

    @Test
    fun `une echeance future bloque, une echeance passee ou illisible non`() {
        assertThat(RelationRaiseGate(raiseBlockedUntil = "2026-11-20T00:00:00.000Z").blocks(now)).isTrue()
        assertThat(RelationRaiseGate(raiseBlockedUntil = "2026-11-01T00:00:00Z").blocks(now)).isFalse()
        assertThat(RelationRaiseGate(raiseBlockedUntil = "demain").blocks(now)).isFalse()
    }

    @Test
    fun `canRaise faux bloque, vrai laisse l'echeance decider`() {
        assertThat(RelationRaiseGate(canRaise = false).blocks(now)).isTrue()
        assertThat(RelationRaiseGate(canRaise = true, raiseBlockedUntil = "2026-11-20T00:00:00Z").blocks(now)).isTrue()
        assertThat(RelationRaiseGate(canRaise = true).blocks(now)).isFalse()
    }
}

/** Un collègue de l'équipe sans lien (#16643) : ce que la fiche laisse bloquer se lit sur `accessLevel`, jamais sur un cercle. */
class ReceptionSettingsOfferedTest {

    @Test
    fun `le Bring se bloque des Ami, le talkie des Proche, rien en dessous`() {
        assertThat(CirclePersonSetting.receptionAt(RelationLevel.ACQUAINTANCE)).isEmpty()
        assertThat(CirclePersonSetting.receptionAt(RelationLevel.FRIEND)).containsExactly(RelationReceptionSetting.BRING)
        assertThat(CirclePersonSetting.receptionAt(RelationLevel.CLOSE))
            .containsExactly(RelationReceptionSetting.BRING, RelationReceptionSetting.TALKIE).inOrder()
        assertThat(CirclePersonSetting.receptionAt(RelationLevel.BLOOD))
            .containsExactly(RelationReceptionSetting.BRING, RelationReceptionSetting.TALKIE).inOrder()
    }

    @Test
    fun `le verrou de remontee porte le niveau des outils quand la passerelle le sert`() {
        assertThat(RelationRaiseGate().accessLevel).isNull()
        assertThat(RelationRaiseGate(accessLevel = RelationLevel.BLOOD).accessLevel).isEqualTo(RelationLevel.BLOOD)
    }
}
