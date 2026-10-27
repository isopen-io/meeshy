package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Témoins de comportement des fonctions que les vecteurs n'exercent pas (`resolveRiverLivingLanes`,
 * `resolveRiverLaneAt`) et des règles de l'avis système — transposés de `RiverLaneVectorTests.swift`
 * et de `packages/shared/__tests__/river-lanes.test.ts`.
 */
class RiverLaneQueriesTest {

    private val t0 = 1_786_957_200_000.0
    private val silenceMinutes = RiverLawConstants.LANE_SILENCE_WINDOW_MS / 60_000

    private val participants = listOf(
        RiverParticipantInput("me", "Moi"),
        RiverParticipantInput("mia", "Mia"),
        RiverParticipantInput("sarah", "Sarah"),
        RiverParticipantInput("tom", "Tom"),
        RiverParticipantInput("lena", "Lena"),
    )

    private fun message(id: String, sender: String, minutes: Double, replyTo: String? = null) =
        RiverMessageInput(id, sender, t0 + minutes * 60_000, replyTo)

    private fun notice(id: String, sender: String, minutes: Double) =
        RiverMessageInput(id, sender, t0 + minutes * 60_000, null, isSystem = true)

    private fun geometry(vararg messages: RiverMessageInput) =
        RiverLaneResolver.resolveRiverLanes(ResolveRiverLanesInput(messages.toList(), participants, "me"))

    private fun crowd(count: Int, minutes: (Int) -> Double) = RiverLaneResolver.resolveRiverLanes(
        ResolveRiverLanesInput(
            messages = (0 until count).map { message("m$it", "p$it", minutes(it)) },
            participants = (0 until count).map { RiverParticipantInput("p$it", "P$it") },
            viewerId = "absent",
        ),
    )

    private val threeVoices
        get() = geometry(message("a", "mia", 0.0), message("b", "sarah", 1.0), message("c", "tom", silenceMinutes + 5))

    @Test
    fun `seules les branches vivantes au rang sont navigables, par colonne croissante`() {
        val g = threeVoices
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(g, 0)).containsExactly(0)
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(g, 1)).containsExactly(0, 1).inOrder()
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(g, 2)).containsExactly(2)
    }

    @Test
    fun `hors de la fenetre aucun couloir n est vivant`() {
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(threeVoices, 9)).isEmpty()
    }

    @Test
    fun `serialisee un seul couloir vivant sur tout rang de la fenetre, rien au-dela`() {
        val thread = geometry(message("a", "mia", 0.0), message("b", "sarah", 1.0))
        assertThat(thread.layout).isEqualTo(RiverLayout.SERIALIZED)
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(thread, 0)).containsExactly(0)
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(thread, 1)).containsExactly(0)
        assertThat(RiverLaneQueries.resolveRiverLivingLanes(thread, 2)).isEmpty()
    }

    @Test
    fun `une colonne partagee rend l occupant vivant, jamais le premier venu`() {
        val shared = crowd(10) { it * (silenceMinutes + 5) }
        assertThat(RiverLaneQueries.resolveRiverLaneAt(shared, 0, 0)?.laneId).isEqualTo("p0")
        assertThat(RiverLaneQueries.resolveRiverLaneAt(shared, 0, 4)?.laneId).isEqualTo("p4")
        assertThat(RiverLaneQueries.resolveRiverLaneAt(shared, 0, 9)?.laneId).isEqualTo("p9")
    }

    @Test
    fun `une colonne eteinte ou inexistante ne rend personne`() {
        val g = threeVoices
        val mia = g.lanes.first { it.laneId == "mia" }
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, mia.laneIndex, 2)).isNull()
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 42, 0)).isNull()
    }

    @Test
    fun `serialisee la colonne unique appartient a l auteur du rang`() {
        val g = geometry(message("a", "mia", 0.0), message("b", "sarah", 1.0))
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 0, 0)?.laneId).isEqualTo("mia")
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 0, 1)?.laneId).isEqualTo("sarah")
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 1, 0)).isNull()
    }

    @Test
    fun `serialisee elle ne nomme aucune colonne au rang d une annonce, meme si l arrivant parle ensuite`() {
        val g = geometry(notice("j", "mia", 0.0), message("a", "mia", 1.0), message("b", "sarah", 2.0))
        assertThat(g.layout).isEqualTo(RiverLayout.SERIALIZED)
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 0, 0)).isNull()
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 0, 1)?.laneId).isEqualTo("mia")
        assertThat(RiverLaneQueries.resolveRiverLaneAt(g, 0, 2)?.laneId).isEqualTo("sarah")
    }

    @Test
    fun `un avis coupe le groupe des deux cotes et ne continue jamais un voisin`() {
        val g = geometry(message("a", "mia", 0.0), notice("j", "mia", 1.0), message("b", "mia", 2.0))
        assertThat(g.bubbles.map { it.isFirstInGroup }).containsExactly(true, true, true)
    }

    @Test
    fun `un avis n ajoute aucun noeud a la branche de la personne concernee`() {
        val g = geometry(message("a", "mia", 0.0), message("b", "sarah", 1.0), message("c", "tom", 2.0), notice("j", "mia", 3.0))
        val nodes = g.lanes.first { it.laneId == "mia" }.spans.flatMap { it.nodes }
        assertThat(nodes).containsExactly(RiverNode(0, RiverNodeKind.BUBBLE, "a"))
    }

    @Test
    fun `repondre a un avis ne convoque aucune branche et ne trace aucun connecteur`() {
        val g = geometry(
            message("a", "mia", 0.0), notice("j", "lena", 1.0),
            message("b", "sarah", 2.0, replyTo = "j"), message("c", "tom", 3.0),
        )
        assertThat(g.lanes.map { it.laneId }).containsExactly("mia", "sarah", "tom").inOrder()
        assertThat(g.connectors).isEmpty()
        assertThat(g.voiceCount).isEqualTo(3)
    }

    @Test
    fun `un message sans la marque systeme decrit une riviere de pure parole`() {
        val plain = RiverMessageInput("a", "mia", t0)
        assertThat(plain.isSystem).isFalse()
        assertThat(geometry(plain).bubbles.map { it.isSystem }).containsExactly(false)
    }

    @Test
    fun `un horodatage illisible est ecarte, jamais invente`() {
        val g = geometry(RiverMessageInput("x", "mia", Double.NaN), message("a", "mia", 0.0))
        assertThat(g.rankCount).isEqualTo(1)
    }
}
