package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le rattrapage du carnet : pistes ordonnées, étapes ouvertes ou en attente, jamais un saut (#9961, #10155). */
class GamePhotoCatchUpLawTest {

    private fun standing(
        rank: GloryRank = GloryRank.Voix,
        division: Int? = 4,
        minted: Int = 25,
        flameRecord: Int = 8,
    ) = PhotoCatchUpStanding(rank = rank, division = division, minted = minted, flameRecord = flameRecord)

    @Test
    fun `dans une piste seule la premiere etape sans photo est ouverte et les suivantes l attendent`() {
        val entries = GamePhotoCatchUpLaw.catchUp(standing(), kept = setOf("start"))
        val meesh = entries.filter { it.track == PhotoTrack.Meesh }
        assertThat(meesh.map { it.id }).containsExactly("meesh:1", "meesh:10", "meesh:20").inOrder()
        assertThat(meesh.map { it.isOpen }).containsExactly(true, false, false).inOrder()
        assertThat(meesh.drop(1).map { it.blockedBy }).containsExactly("meesh:1", "meesh:1")
    }

    @Test
    fun `les pistes ne s attendent pas entre elles`() {
        val open = GamePhotoCatchUpLaw.catchUp(standing(), kept = emptySet()).filter { it.isOpen }.map { it.track }
        assertThat(open).containsAtLeast(PhotoTrack.Start, PhotoTrack.Rank, PhotoTrack.Meesh, PhotoTrack.Flame)
        assertThat(open.toSet().size).isEqualTo(open.size)
    }

    @Test
    fun `une proposition ne saute jamais une etape plus ancienne de sa piste`() {
        val offer = GamePhotoCatchUpLaw.offer(listOf("meesh:20"), standing(), kept = setOf("start"))
        assertThat(offer).isEqualTo("meesh:1")
    }

    @Test
    fun `le rang passe avant le palier avant la Meesh`() {
        val offer = GamePhotoCatchUpLaw.offer(listOf("meesh:10", "tier:lueur", "rank:voix:4"), standing(), kept = setOf("start"))
        assertThat(offer).isEqualTo(GamePhotoCatchUpLaw.catchUp(standing(), setOf("start")).first { it.track == PhotoTrack.Rank && it.isOpen }.id)
    }

    @Test
    fun `la politique rang au passage ne photographie que la division V et ne verrouille pas sa piste`() {
        val policy = PhotoAlertPolicy.Standard.copy(photographs = PhotoAlertPolicy.Photographs.RankPassage)
        val ranks = GamePhotoCatchUpLaw.stepsReached(standing(), policy).filter { it.track == PhotoTrack.Rank }.map { it.id }
        assertThat(ranks).containsExactly("rank:echo:5", "rank:voix:5").inOrder()
        val entries = GamePhotoCatchUpLaw.catchUp(standing(), setOf("rank:echo:5"), policy).filter { it.track == PhotoTrack.Rank }
        assertThat(entries.map { it.id }).containsExactly("rank:voix:5")
        assertThat(entries.single().isOpen).isTrue()
    }
}
