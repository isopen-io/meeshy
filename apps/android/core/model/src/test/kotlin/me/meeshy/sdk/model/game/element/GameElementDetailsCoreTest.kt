package me.meeshy.sdk.model.game.element

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.GameDetailFactKey
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/** Un détail par famille du cœur : l'état verrouillé, obtenu ou valeur se lit sur ce que la passerelle sert. */
class GameElementDetailsCoreTest {

    private fun block(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    @Test
    fun `l anneau du niveau dit une valeur et sa jauge, son emblème est l etat de la lumiere`() {
        val game = block()
        val detail = GameElementDetailsCore.levelRing(game.level)

        assertThat(detail.kind).isEqualTo(GameElementKind.LevelRing)
        assertThat(detail.concept).isEqualTo(ProgressionConcept.Level)
        assertThat(detail.emblem).isInstanceOf(GameElementEmblem.Tier::class.java)
        assertThat(detail.status).isInstanceOf(GameElementStatus.Value::class.java)
        assertThat(detail.id).isEqualTo("ring:${game.level.shown.level}")
    }

    @Test
    fun `le rang dit la gloire en valeur et pointe la fiche de la gloire`() {
        val game = block()
        val detail = GameElementDetailsCore.rank(game.glory)

        assertThat(detail.kind).isEqualTo(GameElementKind.Rank)
        assertThat(detail.concept).isEqualTo(ProgressionConcept.Glory)
        assertThat((detail.status as GameElementStatus.Value).value).isEqualTo(GameText.of(GameTextKey.RankGlory, GameTextArg.Count(game.glory.glory)))
    }

    @Test
    fun `le palier du tresor se dessine en piece d argent`() {
        val detail = GameElementDetailsCore.treasuryTier(block().treasury)

        assertThat(detail.kind).isEqualTo(GameElementKind.TreasuryTier)
        assertThat(detail.emblem).isEqualTo(GameElementEmblem.Coin(MeeshEdition.Silver))
    }

    @Test
    fun `la forme de Flamme dit les jours d affilee, le bonus et l etat quand il y a quelque chose a dire`() {
        val flame = block().flame
        val lit = GameElementDetailsCore.flameForm(flame)
        val atRisk = GameElementDetailsCore.flameForm(flame.copy(status = FlameStatus.AtRisk))

        assertThat(lit.emblem).isEqualTo(GameElementEmblem.Flame(FlameFormKey.Flamme))
        assertThat((lit.status as GameElementStatus.Value).value).isEqualTo(GameText.of(GameTextKey.Days, GameTextArg.Count(8)))
        assertThat(lit.facts.map { it.label.key }).containsExactly(GameTextKey.FactBonus)
        assertThat(atRisk.facts.map { it.label.key }).containsExactly(GameTextKey.FactBonus, GameTextKey.FactState).inOrder()
    }

    @Test
    fun `sans forme la Flamme est eteinte et porte le nom de son concept`() {
        val detail = GameElementDetailsCore.flameForm(block().flame.copy(form = null, days = 0, status = FlameStatus.Out))

        assertThat(detail.key).isEqualTo("out")
        assertThat(detail.name).isEqualTo(GameText(GameTextKey.ConceptNameFlame))
        assertThat(detail.emblem).isEqualTo(GameElementEmblem.Flame(null))
    }

    @Test
    fun `les Veilleuses disent combien sont gardees sur le maximum, avec la jauge`() {
        val detail = GameElementDetailsCore.freeze(block().flame)

        assertThat((detail.status as GameElementStatus.Value).progress).isEqualTo(0.5)
        assertThat(detail.facts.single().label.key).isEqualTo(GameTextKey.FactFreezePrice)
    }

    @Test
    fun `une mission faite est obtenue, une mission a faire est verrouillee avec sa jauge`() {
        val items = block().missions.items
        val open = items.first { !it.isCompleted }
        val done = items.first { it.isCompleted }

        val locked = GameElementDetailsCore.mission(open).status as GameElementStatus.Locked
        assertThat(locked.progress).isEqualTo(open.progress.toDouble() / open.target)
        assertThat(locked.missing).isEqualTo(GameText.of(GameTextKey.Ratio, GameTextArg.Count(open.progress), GameTextArg.Count(open.target)))
        assertThat(GameElementDetailsCore.mission(done).status).isEqualTo(GameElementStatus.Obtained(null))
    }

    @Test
    fun `la gloire d une mission sans gloire ne s ecrit pas`() {
        val mission = block().missions.items.first()

        assertThat(GameElementDetailsCore.mission(mission.copy(glory = 0)).facts.map { it.label.key }).doesNotContain(GameTextKey.ConceptNameGlory)
        assertThat(GameElementDetailsCore.mission(mission.copy(glory = 12)).facts.map { it.label.key }).contains(GameTextKey.ConceptNameGlory)
    }

    @Test
    fun `le coffre est voile avec les actes faits, pret, puis ouvert`() {
        val game = block()
        val locked = GameElementDetailsCore.chest(game.chest.copy(status = ChestStatus.Locked), game.missions)
        val ready = GameElementDetailsCore.chest(game.chest.copy(status = ChestStatus.Ready), game.missions)
        val claimed = GameElementDetailsCore.chest(game.chest.copy(status = ChestStatus.Claimed), game.missions)

        assertThat((locked.status as GameElementStatus.Locked).progress).isEqualTo(0.5)
        assertThat(ready.status).isEqualTo(GameElementStatus.Value(GameText(GameTextKey.ChipChestReady), 1.0))
        assertThat(claimed.status).isEqualTo(GameElementStatus.Obtained(null))
        assertThat(claimed.emblem).isEqualTo(GameElementEmblem.Chest(open = true))
        assertThat(locked.emblem).isEqualTo(GameElementEmblem.Chest(open = false))
    }

    @Test
    fun `la piece est prete a frapper ou verrouillee avec ce qu il manque et la part deja en poche`() {
        val mint = block().mint
        val blocked = GameElementDetailsCore.coin(mint.copy(canMint = false, price = 1000, missingPoints = 250))
        val ready = GameElementDetailsCore.coin(mint.copy(canMint = true, missingPoints = 0))

        assertThat((blocked.status as GameElementStatus.Locked).progress).isEqualTo(0.75)
        assertThat(ready.status).isEqualTo(GameElementStatus.Value(GameText(GameTextKey.ChipMintReady), 1.0))
        assertThat(blocked.emblem).isEqualTo(GameElementEmblem.Coin(mint.edition ?: MeeshEdition.Silver))
    }

    @Test
    fun `une famille d elan est active quand la fenetre servie la nomme, au repos sinon`() {
        val elan = me.meeshy.sdk.model.game.engagement.EngagementElanProgress(
            factor = 1.25, activeFamilyCount = 1, hasStanding = true, windowDays = 7, isAccelerated = false,
            activeFamilies = listOf(EngagementAxisFamily.SOCIAL),
        )

        assertThat((GameElementDetailsCore.elanFamily(EngagementAxisFamily.SOCIAL, elan).status as GameElementStatus.Value).value)
            .isEqualTo(GameText(GameTextKey.DetailElanActive))
        assertThat((GameElementDetailsCore.elanFamily(EngagementAxisFamily.TOOL, elan).status as GameElementStatus.Value).value)
            .isEqualTo(GameText(GameTextKey.DetailElanIdle))
        val noElan = GameElementDetailsCore.elanFamily(EngagementAxisFamily.TOOL, null)
        assertThat(noElan.facts.map { it.label.key }).doesNotContain(GameTextKey.FactWindow)
    }

    @Test
    fun `une ligne de donnee porte sa phrase et son concept, la valeur en etat`() {
        val row = FicheFact(GameText(GameTextKey.FactRecord), GameText.of(GameTextKey.Days, GameTextArg.Count(3)), identity = null, detail = GameDetailFactKey.LevelRecord)
        val detail = GameElementDetailsCore.fact(row, ProgressionConcept.Level, gauge = 0.4)

        assertThat(detail.kind).isEqualTo(GameElementKind.Fact)
        assertThat(detail.factKey).isEqualTo(GameDetailFactKey.LevelRecord)
        assertThat(detail.status).isEqualTo(GameElementStatus.Value(row.value, 0.4))
        assertThat(detail.name).isEqualTo(row.label)
    }

    @Test
    fun `l emblème du heros ouvre l element principal du concept quand le bloc game le sert`() {
        val game = block()
        val fallback = GameElementDetailsCore.fact(
            FicheFact(GameText(GameTextKey.FactRecord), GameText(GameTextKey.FactYes), identity = null), ProgressionConcept.Level,
        )

        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Level, game, fallback).kind).isEqualTo(GameElementKind.LevelRing)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Meesh, game, fallback).kind).isEqualTo(GameElementKind.Coin)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Glory, game, fallback).kind).isEqualTo(GameElementKind.Rank)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Flame, game, fallback).kind).isEqualTo(GameElementKind.FlameForm)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Missions, game, fallback).kind).isEqualTo(GameElementKind.Chest)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Elans, game, fallback)).isSameInstanceAs(fallback)
        assertThat(GameElementDetailsCore.hero(ProgressionConcept.Level, null, fallback)).isSameInstanceAs(fallback)
    }
}
