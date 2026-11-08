package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryRailPlanFreezeTest {

    private fun plan(
        own: Boolean = false,
        comments: Int = 0,
        audible: Boolean = false,
    ) = StoryRailPlan.resolve(isOwnStory = own, hasTranslatableContent = false, commentCount = comments, hasAudibleSound = audible)

    private fun input(
        storyId: String? = "s1",
        live: StoryRailPlan = plan(),
        audible: Boolean = false,
        reconciled: Boolean = false,
    ) = StoryRailFreezeInput(storyId, live, audible, reconciled)

    @Test
    fun `a counter that grows mid-slide does not make a button appear`() {
        val frozen = StoryRailFreeze.start(input(live = plan(comments = 0)))
        val later = frozen.next(input(live = plan(comments = 4)))
        assertThat(later.plan.showsComments).isFalse()
    }

    @Test
    fun `changing story re-freezes on the new live plan`() {
        val frozen = StoryRailFreeze.start(input(storyId = "s1", live = plan(own = false)))
        val other = frozen.next(input(storyId = "s2", live = plan(own = true, comments = 2)))
        assertThat(other.plan.showsViews).isTrue()
        assertThat(other.plan.showsComments).isTrue()
        assertThat(other.storyId).isEqualTo("s2")
    }

    @Test
    fun `the sound button appears when the slide becomes audible, once`() {
        val frozen = StoryRailFreeze.start(input(live = plan(audible = false)))
        val audible = frozen.next(input(live = plan(audible = true), audible = true))
        assertThat(audible.plan.showsSound).isTrue()
        val silentAgain = audible.next(input(live = plan(audible = false), audible = false))
        assertThat(silentAgain.plan.showsSound).isTrue()
    }

    @Test
    fun `the comment count reconciliation reveals the comments button only when it was missing`() {
        val frozen = StoryRailFreeze.start(input(live = plan(comments = 0)))
        val reconciled = frozen.next(input(live = plan(comments = 7), reconciled = true))
        assertThat(reconciled.plan.showsComments).isTrue()
    }

    @Test
    fun `a comment sent after the reconciliation does not re-open the plan`() {
        val frozen = StoryRailFreeze.start(input(live = plan(comments = 0), reconciled = true))
        val later = frozen.next(input(live = plan(comments = 1), reconciled = true))
        assertThat(later.plan.showsComments).isFalse()
    }

    @Test
    fun `an unchanged input leaves the freeze untouched`() {
        val frozen = StoryRailFreeze.start(input())
        assertThat(frozen.next(input())).isEqualTo(frozen)
    }

    @Test
    fun `density goes from normal to tight to scrolling as the height shrinks`() {
        assertThat(StoryRailDensity.choose(availablePx = 900, normalPx = 800, tightPx = 600)).isEqualTo(StoryRailDensity.NORMAL)
        assertThat(StoryRailDensity.choose(availablePx = 700, normalPx = 800, tightPx = 600)).isEqualTo(StoryRailDensity.TIGHT)
        assertThat(StoryRailDensity.choose(availablePx = 500, normalPx = 800, tightPx = 600)).isEqualTo(StoryRailDensity.SCROLL)
    }
}
