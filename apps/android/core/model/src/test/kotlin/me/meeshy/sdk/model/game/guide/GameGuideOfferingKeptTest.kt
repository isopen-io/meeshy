package me.meeshy.sdk.model.game.guide

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameGuideTarget
import me.meeshy.sdk.model.game.GameNavigationMap
import me.meeshy.sdk.model.game.GameWelcomeBack
import me.meeshy.sdk.model.game.guide.GuideTestGames.beginner
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.replacing
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import org.junit.Test

/**
 * L'OFFRANDE GARDÉE PAR LES AÏEUX (#20404) — miroir de `GameWelcomeBack.announcesKeptOffering`, `GameGuideEventsV2`
 * et `GameGuideCard.ofMomentV2` (iOS, #20403) : le jour du retour, Mee dit sans reproche que l'Offrande est gardée,
 * tant qu'elle est prête, et mène à la fiche du Rêve.
 */
class GameGuideOfferingKeptTest {

    private fun game(kept: Boolean?, status: ChestStatus = ChestStatus.Ready, seen: List<String> = emptyList()): GameBlock {
        val base = beginner(seen)
        return base.copy(chest = base.chest.copy(status = status, kept = kept))
    }

    @Test
    fun `le bloc lit l'Offrande gardee, tolerant, et un serveur anterieur ne la sert pas`() {
        val kept = JsonObject(GameBlockFixtures.chest() + ("kept" to JsonPrimitive(true)))
        val odd = JsonObject(GameBlockFixtures.chest() + ("kept" to JsonPrimitive("oui")))

        assertThat(GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("chest" to kept)))?.chest?.kept).isTrue()
        assertThat(GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("chest" to odd)))?.chest?.kept).isNull()
        assertThat(GameBlockParser.parse(GameBlockFixtures.block())?.chest?.kept).isNull()
    }

    @Test
    fun `remplacer le statut du coffre garde la marque des aieux`() {
        val chest = game(kept = true).chest

        assertThat(chest.replacing(status = ChestStatus.Claimed).kept).isTrue()
    }

    @Test
    fun `l'Offrande gardee ne s'annonce que prete, et jamais devant un serveur anterieur`() {
        assertThat(GameWelcomeBack.announcesKeptOffering(kept = true, status = ChestStatus.Ready)).isTrue()
        assertThat(GameWelcomeBack.announcesKeptOffering(kept = true, status = ChestStatus.Claimed)).isFalse()
        assertThat(GameWelcomeBack.announcesKeptOffering(kept = false, status = ChestStatus.Ready)).isFalse()
        assertThat(GameWelcomeBack.announcesKeptOffering(kept = null, status = ChestStatus.Ready)).isFalse()
        assertThat(GameWelcomeBack.EASED_DAYS).isEqualTo(3)
    }

    @Test
    fun `l'etat a l'ouverture la redit tant qu'elle est prete, meme deja entendue`() {
        val said = GuideEventV2.OfferingKept(easedDays = 3)

        assertThat(GameGuideEventsV2.standing(game(true), emptySet())).containsExactly(said)
        assertThat(GameGuideEventsV2.standing(game(true), setOf("offering-kept"))).containsExactly(said)
        assertThat(GameGuideEventsV2.standing(game(true, ChestStatus.Claimed), emptySet())).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(null), emptySet())).isEmpty()
    }

    @Test
    fun `elle se dit en arrivant, pas quand la lecture d'avant la portait deja`() {
        assertThat(GameGuideEventsV2.transition(game(null), game(true))).containsExactly(GuideEventV2.OfferingKept(3))
        assertThat(GameGuideEventsV2.transition(game(true), game(true))).isEmpty()
        assertThat(GameGuideEventsV2.transition(game(true), game(true, ChestStatus.Claimed))).isEmpty()
    }

    @Test
    fun `Mee la dit et sa carte ouvre la fiche du Reve, sans photo`() {
        val chosen = GameGuideV2.chooseMoment(listOf(GuideAnyEvent.Wave2(GuideEventV2.OfferingKept(3))), emptySet())
        val moment = (chosen as GuideAnyMoment.Wave2).moment
        val card = GameGuideCards.of(moment)

        assertThat(moment.key.wire).isEqualTo("offering-kept")
        assertThat(moment.speaker).isEqualTo(GuideSpeaker.Mee)
        assertThat(moment.mood).isEqualTo(GuideMood.Cheer)
        assertThat(moment.action).isEqualTo(GuideActionV2.SeeMissions)
        assertThat(GuideActionV2.SeeMissions.wire).isEqualTo("see-missions")
        assertThat(card.photo).isFalse()
        assertThat(card.destination).isEqualTo(GuideDestination.Concept(ProgressionConcept.Missions))
        assertThat(GameGuideTarget.page(GuideActionV2.SeeMissions)).isNull()
        assertThat(GameNavigationMap.guideConcept(GuideActionV2.SeeMissions)).isEqualTo(ProgressionConcept.Missions)
        assertThat(GameNavigationMap.guideConcept(GuideActionV2.SeeFlame)).isEqualTo(ProgressionConcept.Flame)
    }

    @Test
    fun `elle passe juste avant la Flamme eteinte et apres la fin d'une saison`() {
        val rank = { key: String -> GameGuideV2.momentPriority.indexOf(key) }

        assertThat(rank("offering-kept")).isEqualTo(rank("flame-out") - 1)
        assertThat(rank("offering-kept")).isEqualTo(rank("season-end") + 1)
    }
}
