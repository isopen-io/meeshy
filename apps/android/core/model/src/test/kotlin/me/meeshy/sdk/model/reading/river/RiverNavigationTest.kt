package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `RiverNavigation` — l'état, pas la loi : les vecteurs prouvent déjà `resolveRiverStep`. On prouve
 * qu'il délègue CHAQUE pas, tient curseur et raison, n'incrémente le jeton QUE sur un bord, et que
 * `moveTo` est un choix explicite. Miroir de `RiverNavigationControllerTests.swift`.
 */
class RiverNavigationTest {

    private val geometry = RiverLaneResolver.resolveRiverLanes(
        ResolveRiverLanesInput(
            messages = listOf("u1", "u2", "u3", "u1", "u2", "u3").mapIndexed { index, sender ->
                RiverMessageInput("m$index", sender, index * 1000.0)
            },
            participants = listOf(RiverParticipantInput("u1", "Toi"), RiverParticipantInput("u2", "Bob"), RiverParticipantInput("u3", "Carol")),
            viewerId = "u1",
        ),
    )

    private fun at(lane: Int, rank: Int) = RiverNavigation(RiverCursor(lane, rank))

    @Test
    fun `decor - trois voix, trois couloirs, jamais serialisee`() {
        assertThat(geometry.layout).isEqualTo(RiverLayout.LANES)
        assertThat(geometry.voiceCount).isEqualTo(3)
        assertThat(geometry.laneCount).isEqualTo(3)
    }

    @Test
    fun `etat initial - curseur recu, aucune raison, jeton a zero`() {
        val navigation = at(0, 0)
        assertThat(navigation.cursor).isEqualTo(RiverCursor(0, 0))
        assertThat(navigation.lastReason).isNull()
        assertThat(navigation.edgeBounceToken).isEqualTo(0)
    }

    @Test
    fun `un pas a droite au bord ne bouge pas et avance le jeton`() {
        val navigation = at(0, 0).step(geometry, RiverStepDirection.RIGHT)
        assertThat(navigation.cursor).isEqualTo(RiverCursor(0, 0))
        assertThat(navigation.lastReason).isEqualTo(RiverStepReason.EDGE)
        assertThat(navigation.edgeBounceToken).isEqualTo(1)
    }

    @Test
    fun `des bords repetes avancent le jeton a chaque fois`() {
        val navigation = (1..3).fold(at(0, 0)) { state, _ -> state.step(geometry, RiverStepDirection.RIGHT) }
        assertThat(navigation.edgeBounceToken).isEqualTo(3)
    }

    @Test
    fun `descendre suit la meme personne par-dessus les bulles des autres`() {
        val navigation = at(1, 1).step(geometry, RiverStepDirection.DOWN)
        assertThat(navigation.cursor).isEqualTo(RiverCursor(1, 4))
        assertThat(navigation.lastReason).isEqualTo(RiverStepReason.MOVED)
        assertThat(navigation.edgeBounceToken).isEqualTo(0)
    }

    @Test
    fun `monter revient au premier message puis bute`() {
        val up = at(1, 4).step(geometry, RiverStepDirection.UP)
        assertThat(up.cursor).isEqualTo(RiverCursor(1, 1))
        assertThat(up.lastReason).isEqualTo(RiverStepReason.MOVED)
        val edge = up.step(geometry, RiverStepDirection.UP)
        assertThat(edge.cursor).isEqualTo(RiverCursor(1, 1))
        assertThat(edge.lastReason).isEqualTo(RiverStepReason.EDGE)
        assertThat(edge.edgeBounceToken).isEqualTo(1)
    }

    @Test
    fun `moveTo pose le curseur sans toucher au jeton de rebond`() {
        val bounced = at(0, 0).step(geometry, RiverStepDirection.RIGHT)
        val moved = bounced.moveTo(RiverCursor(2, 2))
        assertThat(moved.cursor).isEqualTo(RiverCursor(2, 2))
        assertThat(moved.lastReason).isEqualTo(RiverStepReason.MOVED)
        assertThat(moved.edgeBounceToken).isEqualTo(1)
    }

    @Test
    fun `sur une geometrie vide le curseur survit tel quel, jamais invente`() {
        val empty = RiverLaneResolver.resolveRiverLanes(ResolveRiverLanesInput(emptyList(), emptyList(), "u1"))
        val navigation = at(1, 1).step(empty, RiverStepDirection.DOWN)
        assertThat(navigation.cursor).isEqualTo(RiverCursor(1, 1))
        assertThat(navigation.lastReason).isEqualTo(RiverStepReason.EMPTY)
        assertThat(navigation.edgeBounceToken).isEqualTo(0)
    }
}
