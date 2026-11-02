package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

class ProgressionConceptModelTest {

    private val moment = SeasonMoment("2026-10-20", 600)
    private val now = 1_792_000_000_000L

    private fun game(overrides: Map<String, JsonElement?> = emptyMap()): GameBlock =
        checkNotNull(GameBlockParser.parse(GameBlockFixtures.block(overrides = overrides)))

    private fun progress(game: GameBlock? = null): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun cards(game: GameBlock?) = ProgressionConceptModel.cards(progress(game), game, now, moment)

    private fun card(concept: ProgressionConcept, game: GameBlock?) = cards(game).first { it.concept == concept }

    @Test
    fun `devant un ancien serveur la liste se raccourcit et ne ment pas`() {
        val served = ProgressionConcepts.served(progress(), null)

        assertThat(served).containsAtLeast(
            ProgressionConcept.Level, ProgressionConcept.Flame, ProgressionConcept.Elans,
            ProgressionConcept.Badges, ProgressionConcept.Succes,
        )
        assertThat(served).containsNoneOf(
            ProgressionConcept.Points, ProgressionConcept.Glory, ProgressionConcept.Missions,
            ProgressionConcept.League, ProgressionConcept.Season, ProgressionConcept.Prestige,
            ProgressionConcept.Showcase, ProgressionConcept.Atlas, ProgressionConcept.Meesh,
        )
    }

    @Test
    fun `le bloc du jeu ouvre les concepts du jeu de base dans l ordre de l ecran`() {
        val block = game()
        val served = ProgressionConcepts.served(progress(block), block).map { it.wire }

        assertThat(served.take(6)).containsExactly("level", "points", "meesh", "glory", "flame", "missions").inOrder()
        assertThat(served).doesNotContain("league")
        assertThat(served).doesNotContain("atlas")
    }

    @Test
    fun `la lumiere nomme son palier et l anneau porte le niveau`() {
        val level = card(ProgressionConcept.Level, game())

        assertThat(level.value?.key).isEqualTo(GameTextKey.TierNebuleuse)
        assertThat(level.emblemLevel).isEqualTo(GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(142)))
        assertThat(level.line?.key).isEqualTo(GameTextKey.ChipToLevel)
        assertThat(level.gauge).isWithin(1e-9).of(0.25)
    }

    @Test
    fun `une frappe impossible dit le manque et ne prend pas la ligne`() {
        val meesh = card(ProgressionConcept.Meesh, game())

        assertThat(meesh.urgent).isFalse()
        assertThat(meesh.line?.key).isEqualTo(GameTextKey.JoinedBySpace)
        assertThat(meesh.gauge).isWithin(1e-9).of((1588 - 300) / 1588.0)
    }

    @Test
    fun `une frappe possible prend la ligne et la marque`() {
        val mint = buildJsonObject {
            GameBlockFixtures.mint().forEach { (key, value) -> put(key, value) }
            put("canMint", JsonPrimitive(true))
        }

        val meesh = card(ProgressionConcept.Meesh, game(mapOf("mint" to mint)))

        assertThat(meesh.urgent).isTrue()
        assertThat(meesh.line?.key).isEqualTo(GameTextKey.ChipMintReady)
    }

    @Test
    fun `l offrande prete prend la ligne du reve`() {
        val block = game()
        val missions = card(ProgressionConcept.Missions, block)

        assertThat(block.chest.status).isEqualTo(ChestStatus.Ready)
        assertThat(missions.urgent).isTrue()
        assertThat(missions.line?.key).isEqualTo(GameTextKey.ChipChestReady)
        assertThat(missions.value?.key).isEqualTo(GameTextKey.Ratio)
        assertThat(missions.gauge).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `la Flamme en danger prend la ligne`() {
        val flameAtRisk = buildJsonObject {
            GameBlockFixtures.flame().forEach { (key, value) -> put(key, value) }
            put("status", JsonPrimitive("at-risk"))
        }

        val flame = card(ProgressionConcept.Flame, game(mapOf("flame" to flameAtRisk)))

        assertThat(flame.urgent).isTrue()
        assertThat(flame.line?.key).isEqualTo(GameTextKey.FlameStatusAtRisk)
    }

    @Test
    fun `une serie nulle ne se dit pas zero jour`() {
        val flame = card(ProgressionConcept.Flame, null)

        assertThat(flame.value?.key).isEqualTo(GameTextKey.FlameNoStreak)
        assertThat(flame.line?.key).isEqualTo(GameTextKey.StreakRecord)
    }

    @Test
    fun `le rang dit sa division en chiffres romains`() {
        val glory = card(ProgressionConcept.Glory, game())

        assertThat(glory.value?.args).hasSize(2)
        assertThat(glory.value?.args?.get(1)).isEqualTo(GameTextArg.Verbatim("III"))
        assertThat(glory.gauge).isWithin(1e-9).of(0.1)
    }

    @Test
    fun `un compte sans activite n a pas de carte vide`() {
        val badges = card(ProgressionConcept.Badges, null)

        assertThat(badges.value?.key).isEqualTo(GameTextKey.Ratio)
        assertThat(badges.line?.key).isAnyOf(GameTextKey.ChipToUnlock, GameTextKey.ChipAllDone)
    }

    @Test
    fun `sans plafond connu un niveau fige est au sommet`() {
        assertThat(ProgressionConceptModel.levelTopShort(null).key).isEqualTo(GameTextKey.BannerTop)
        assertThat(ProgressionConceptModel.levelTopShort(499).key).isEqualTo(GameTextKey.LevelCapShort)
    }
}
