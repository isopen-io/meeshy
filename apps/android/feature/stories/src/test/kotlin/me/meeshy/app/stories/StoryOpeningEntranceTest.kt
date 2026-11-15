package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test

class StoryOpeningEntranceTest {
    @Test
    fun `chaque effet part invisible avec son etat de depart`() {
        assertThat(StoryOpeningEntrance.armed(StoryTransitionEffect.ZOOM).openingScale).isWithin(1e-6f).of(1.08f)
        assertThat(StoryOpeningEntrance.armed(StoryTransitionEffect.SLIDE).openingSlideFraction).isWithin(1e-6f).of(0.08f)
        assertThat(StoryOpeningEntrance.armed(StoryTransitionEffect.FADE).textSlideOffsetDp).isEqualTo(14f)
        assertThat(StoryOpeningEntrance.armed(null).textSlideOffsetDp).isEqualTo(14f)
        StoryTransitionEffect.values().forEach { assertThat(StoryOpeningEntrance.armed(it).contentOpacity).isEqualTo(0f) }
        assertThat(StoryOpeningEntrance.armed(StoryTransitionEffect.REVEAL).isRevealActive).isFalse()
    }

    @Test
    fun `le repos est neutre sauf la revelation qui reste active`() {
        assertThat(StoryOpeningEntrance.rest(StoryTransitionEffect.REVEAL).isRevealActive).isTrue()
        assertThat(StoryOpeningEntrance.rest(StoryTransitionEffect.ZOOM))
            .isEqualTo(StoryOpeningEntrance(1f, 1f, 0f, 0f, false))
    }

    @Test
    fun `duree commune de 1,2 s pour les effets nommes et 350 ms pour le fondu`() {
        assertThat(StoryOpeningEntrance.durationMillis(StoryTransitionEffect.SLIDE)).isEqualTo(1200)
        assertThat(StoryOpeningEntrance.durationMillis(StoryTransitionEffect.FADE)).isEqualTo(350)
    }
}
