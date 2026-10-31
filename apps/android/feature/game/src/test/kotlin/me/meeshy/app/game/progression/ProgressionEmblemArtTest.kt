package me.meeshy.app.game.progression

import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.model.game.AtlasStamp
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.SignatureStyle
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Le dessin de chaque concept, miroir de `ProgressionConceptEmblem.drawing` (iOS) : un emblème DÉDIÉ par concept — jamais
 * un pictogramme sur disque teinté — lu dans l'état servi, avec le défaut d'iOS quand le bloc de jeu manque.
 */
class ProgressionEmblemArtTest {

    private fun game(
        form: FlameFormKey? = FlameFormKey.Brasier,
        chest: ChestStatus = ChestStatus.Ready,
        league: LeagueKey? = LeagueKey.Jade,
        stamps: List<AtlasStamp>? = listOf(AtlasStamp(language = "ja", stampedOn = "2026-10-01")),
    ): GameBlock = mockk(relaxed = true) {
        every { flame.form } returns form
        every { this@mockk.chest.status } returns chest
        every { this@mockk.league?.current?.league } returns league
        if (stamps == null) every { atlas } returns null else every { atlas?.stamps } returns stamps
    }

    @Test
    fun `points et elans portent leur marque dessinee`() {
        assertEquals(ProgressionEmblemArt.Mark(ConceptMarkKind.Points), ProgressionEmblemArt.of(ProgressionConcept.Points, null))
        assertEquals(ProgressionEmblemArt.Mark(ConceptMarkKind.Elans), ProgressionEmblemArt.of(ProgressionConcept.Elans, null))
    }

    @Test
    fun `la flamme prend la forme servie et la braise sans jeu`() {
        assertEquals(ProgressionEmblemArt.Flame(FlameFormKey.Brasier), ProgressionEmblemArt.of(ProgressionConcept.Flame, game()))
        assertEquals(ProgressionEmblemArt.Flame(FlameFormKey.Braise), ProgressionEmblemArt.of(ProgressionConcept.Flame, game(form = null)))
        assertEquals(ProgressionEmblemArt.Flame(FlameFormKey.Braise), ProgressionEmblemArt.of(ProgressionConcept.Flame, null))
    }

    @Test
    fun `le coffre ne s ouvre qu une fois reclame`() {
        assertEquals(ProgressionEmblemArt.Chest(open = true), ProgressionEmblemArt.of(ProgressionConcept.Missions, game(chest = ChestStatus.Claimed)))
        assertEquals(ProgressionEmblemArt.Chest(open = false), ProgressionEmblemArt.of(ProgressionConcept.Missions, game(chest = ChestStatus.Ready)))
        assertEquals(ProgressionEmblemArt.Chest(open = false), ProgressionEmblemArt.of(ProgressionConcept.Missions, null))
    }

    @Test
    fun `la gemme est celle de la ligue courante et le quartz a defaut`() {
        assertEquals(ProgressionEmblemArt.Gem(LeagueKey.Jade), ProgressionEmblemArt.of(ProgressionConcept.League, game()))
        assertEquals(ProgressionEmblemArt.Gem(LeagueKey.Quartz), ProgressionEmblemArt.of(ProgressionConcept.League, game(league = null)))
        assertEquals(ProgressionEmblemArt.Gem(LeagueKey.Quartz), ProgressionEmblemArt.of(ProgressionConcept.League, null))
    }

    @Test
    fun `saison prestige et vitrine sont trois coupes de matiere differente`() {
        assertEquals(ProgressionEmblemArt.Cup(GameMaterial.PLATINUM), ProgressionEmblemArt.of(ProgressionConcept.Season, null))
        assertEquals(ProgressionEmblemArt.Cup(GameMaterial.PRISM), ProgressionEmblemArt.of(ProgressionConcept.Prestige, null))
        assertEquals(ProgressionEmblemArt.Cup(GameMaterial.GOLD), ProgressionEmblemArt.of(ProgressionConcept.Showcase, null))
    }

    @Test
    fun `le tampon porte la premiere langue tamponnee et reste a decouvrir sans tampon`() {
        assertEquals(ProgressionEmblemArt.Stamp(code = "JA", stamped = true), ProgressionEmblemArt.of(ProgressionConcept.Atlas, game()))
        assertEquals(ProgressionEmblemArt.Stamp(code = "", stamped = false), ProgressionEmblemArt.of(ProgressionConcept.Atlas, game(stamps = emptyList())))
        assertEquals(ProgressionEmblemArt.Stamp(code = "", stamped = false), ProgressionEmblemArt.of(ProgressionConcept.Atlas, game(stamps = null)))
        assertEquals(ProgressionEmblemArt.Stamp(code = "", stamped = false), ProgressionEmblemArt.of(ProgressionConcept.Atlas, null))
    }

    @Test
    fun `niveau et gloire sans jeu montrent la Signature et non une bulle`() {
        assertEquals(ProgressionEmblemArt.Signature(SignatureStyle.Flat), ProgressionEmblemArt.of(ProgressionConcept.Level, null))
        assertEquals(ProgressionEmblemArt.Signature(SignatureStyle.Engraved), ProgressionEmblemArt.of(ProgressionConcept.Glory, null))
        assertEquals(ProgressionEmblemArt.Ring, ProgressionEmblemArt.of(ProgressionConcept.Level, game()))
        assertEquals(ProgressionEmblemArt.Blason, ProgressionEmblemArt.of(ProgressionConcept.Glory, game()))
    }

    @Test
    fun `aucun concept hors la Meesh ne retombe sur un pictogramme`() {
        val pictograms = ProgressionConcept.entries.filter { ProgressionEmblemArt.of(it, game()) == ProgressionEmblemArt.Pictogram }
        assertEquals(listOf(ProgressionConcept.Meesh), pictograms)
    }
}
