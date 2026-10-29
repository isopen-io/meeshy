package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryLimitsTest {

    @Test
    fun `les trois plafonds sont ceux de la decision porteur`() {
        assertThat(StoryLimits.OBJECTS_PER_FAMILY).isEqualTo(50)
        assertThat(StoryLimits.TEXT_LENGTH).isEqualTo(1000)
        assertThat(StoryLimits.TOTAL_SECONDS).isEqualTo(7200.0)
    }

    @Test
    fun `un texte de 1000 caracteres passe tel quel, 1001 est coupe`() {
        val exact = "a".repeat(1000)
        assertThat(StoryLimits.clampText(exact)).isSameInstanceAs(exact)
        assertThat(StoryLimits.clampText("a".repeat(1001))).hasLength(1000)
    }

    @Test
    fun `la coupe ne separe jamais un emoji en deux`() {
        val text = "a".repeat(999) + "😀" + "b"
        val clamped = StoryLimits.clampText(text)
        assertThat(clamped).isEqualTo("a".repeat(999) + "😀")
        assertThat(clamped.last().isHighSurrogate()).isFalse()
    }

    @Test
    fun `les caracteres restants ne sont jamais negatifs`() {
        assertThat(StoryLimits.textCharactersRemaining("abc")).isEqualTo(997)
        assertThat(StoryLimits.textCharactersRemaining("a".repeat(1500))).isEqualTo(0)
    }

    @Test
    fun `la duree d une slide est ramenee a ce que les autres laissent sur les deux heures`() {
        assertThat(StoryLimits.durationWithinBudget(wanted = 600.0, usedByOthers = 0.0, floor = 2.0)).isEqualTo(600.0)
        assertThat(StoryLimits.durationWithinBudget(wanted = 600.0, usedByOthers = 6900.0, floor = 2.0)).isEqualTo(300.0)
        assertThat(StoryLimits.durationWithinBudget(wanted = 600.0, usedByOthers = 7199.0, floor = 2.0)).isEqualTo(2.0)
        assertThat(StoryLimits.durationWithinBudget(wanted = 600.0, usedByOthers = 9000.0, floor = 2.0)).isEqualTo(2.0)
    }
}
