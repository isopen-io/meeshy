package me.meeshy.sdk.model.game.guide

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameFlameLaw
import me.meeshy.sdk.model.game.GameGuideTarget
import me.meeshy.sdk.model.game.GameNavigationMap
import me.meeshy.sdk.model.game.guide.GuideTestGames.beginner
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import org.junit.Test

/**
 * LA PREMIÈRE VEILLEUSE OFFERTE (#20253) — miroir de `GameFlame.announcesFreezeGift`, `GameGuideEventsV2` et
 * `GameGuideCard.ofMomentV2` (iOS, #20252) : Meo la dit le jour du cadeau, une seule fois, et mène à la fiche de la
 * Flamme.
 */
class GameGuideFreezeGiftTest {

    private fun game(freezeGifted: Boolean?, seen: List<String> = emptyList()): GameBlock {
        val base = beginner(seen)
        return base.copy(flame = base.flame.copy(days = 3, freezes = 1, freezeGifted = freezeGifted))
    }

    @Test
    fun `le bloc lit le cadeau du jour, et un serveur anterieur ne le sert pas`() {
        val gifted = JsonObject(GameBlockFixtures.flame() + ("freezeGifted" to JsonPrimitive(true)))
        val served = GameBlockParser.parse(GameBlockFixtures.block(overrides = mapOf("flame" to gifted)))

        assertThat(served?.flame?.freezeGifted).isTrue()
        assertThat(GameBlockParser.parse(GameBlockFixtures.block())?.flame?.freezeGifted).isNull()
    }

    @Test
    fun `le cadeau ne s'annonce que le jour ou il est offert, et une seule fois`() {
        assertThat(GameFlameLaw.announcesFreezeGift(freezeGifted = true, guideSeen = emptyList())).isTrue()
        assertThat(GameFlameLaw.announcesFreezeGift(true, listOf(GameFlameLaw.FREEZE_GIFT_SEEN_KEY))).isFalse()
        assertThat(GameFlameLaw.announcesFreezeGift(false, emptyList())).isFalse()
        assertThat(GameFlameLaw.announcesFreezeGift(null, emptyList())).isFalse()
        assertThat(GameFlameLaw.FREEZE_GIFT_SEEN_KEY).isEqualTo("flame-freeze-gift")
    }

    @Test
    fun `l'etat a l'ouverture dit le cadeau une fois, jamais devant un serveur anterieur`() {
        assertThat(GameGuideEventsV2.standing(game(true), emptySet())).containsExactly(GuideEventV2.FlameFreezeGift(1))
        assertThat(GameGuideEventsV2.standing(game(true, listOf("flame-freeze-gift")), emptySet())).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(true), setOf("flame-freeze-gift"))).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(null), emptySet())).isEmpty()
        assertThat(GameGuideEventsV2.standing(game(false), emptySet())).isEmpty()
    }

    @Test
    fun `le cadeau se dit en arrivant, pas quand la lecture d'avant le portait deja`() {
        assertThat(GameGuideEventsV2.transition(game(null), game(true))).containsExactly(GuideEventV2.FlameFreezeGift(1))
        assertThat(GameGuideEventsV2.transition(game(true), game(true))).isEmpty()
    }

    @Test
    fun `Meo dit le cadeau et sa carte ouvre la fiche de la Flamme, sans photo`() {
        val chosen = GameGuideV2.chooseMoment(listOf(GuideAnyEvent.Wave2(GuideEventV2.FlameFreezeGift(1))), emptySet())
        val moment = (chosen as GuideAnyMoment.Wave2).moment
        val card = GameGuideCards.of(moment)

        assertThat(moment.speaker).isEqualTo(GuideSpeaker.Meo)
        assertThat(moment.mood).isEqualTo(GuideMood.Cheer)
        assertThat(moment.action).isEqualTo(GuideActionV2.SeeFlame)
        assertThat(card.photo).isFalse()
        assertThat(card.destination).isEqualTo(GuideDestination.Concept(ProgressionConcept.Flame))
        assertThat(GameGuideTarget.page(GuideActionV2.SeeFlame)).isNull()
        assertThat(GameNavigationMap.guideConcept(GuideActionV2.SeeFlame)).isEqualTo(ProgressionConcept.Flame)
    }

    @Test
    fun `le cadeau passe juste apres la Flamme a risque et devant un tampon d'Atlas`() {
        val chosen = GameGuideV2.chooseMoment(
            listOf(
                GuideAnyEvent.Wave2(GuideEventV2.AtlasStamp("ja", 4, 89)),
                GuideAnyEvent.Wave2(GuideEventV2.FlameFreezeGift(1)),
            ),
            emptySet(),
        )
        val rank = { key: String -> GameGuideV2.momentPriority.indexOf(key) }

        assertThat((chosen as GuideAnyMoment.Wave2).moment.key).isEqualTo(GuideMomentKeyV2.FlameFreezeGift)
        assertThat(rank("flame-freeze-gift")).isEqualTo(rank("flame-at-risk") + 1)
    }
}
