package me.meeshy.app.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/** « Comment en gagner » ne garde que les conseils qui apprennent quelque chose : un conseil qui redit le (i) n'existe pas (#17688). */
class ConceptTipsTest {

    @Test
    fun `un concept dont les conseils redisaient le i n en garde aucun`() {
        assertThat(ConceptCopy.tips(ProgressionConcept.Meesh)).isEmpty()
        assertThat(ConceptCopy.tips(ProgressionConcept.Season)).isEmpty()
    }

    @Test
    fun `la flamme les missions et la renaissance gardent leur premier conseil seulement`() {
        listOf(ProgressionConcept.Flame, ProgressionConcept.Missions, ProgressionConcept.Prestige)
            .forEach { assertThat(ConceptCopy.tips(it)).hasSize(1) }
    }

    @Test
    fun `les autres concepts gardent leurs deux conseils`() {
        val kept = ProgressionConcept.entries - setOf(
            ProgressionConcept.Meesh, ProgressionConcept.Season, ProgressionConcept.Flame,
            ProgressionConcept.Missions, ProgressionConcept.Prestige,
        )
        kept.forEach { assertThat(ConceptCopy.tips(it)).hasSize(2) }
    }
}
