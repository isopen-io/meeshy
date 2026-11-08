package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTransitionEffect.FADE
import me.meeshy.sdk.model.StoryTransitionEffect.ZOOM
import org.junit.Test

class TransitionRehearsalPlanTest {
    private val both = TransitionRehearsalPlan(opening = FADE, closing = ZOOM)

    @Test
    fun `l ouverture joue d abord puis la pause puis la fermeture puis la fin`() {
        assertThat(both.phaseAt(0.0)).isEqualTo(TransitionRehearsalPlan.Phase.Opening)
        assertThat(both.phaseAt(1.19)).isEqualTo(TransitionRehearsalPlan.Phase.Opening)
        assertThat(both.phaseAt(1.2)).isEqualTo(TransitionRehearsalPlan.Phase.Hold)
        assertThat(both.phaseAt(1.79)).isEqualTo(TransitionRehearsalPlan.Phase.Hold)
        assertThat((both.phaseAt(1.8) as TransitionRehearsalPlan.Phase.Closing).progress).isWithin(1e-9).of(0.0)
        assertThat((both.phaseAt(2.4) as TransitionRehearsalPlan.Phase.Closing).progress).isWithin(1e-9).of(0.5)
        assertThat(both.phaseAt(3.0)).isEqualTo(TransitionRehearsalPlan.Phase.Finished)
        assertThat(both.totalDurationSeconds).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `sans ouverture la pause commence tout de suite`() {
        val plan = TransitionRehearsalPlan(opening = null, closing = ZOOM)
        assertThat(plan.phaseAt(0.0)).isEqualTo(TransitionRehearsalPlan.Phase.Hold)
        assertThat(plan.closingStartSeconds).isWithin(1e-9).of(0.6)
    }

    @Test
    fun `sans fermeture la pause finit la repetition`() {
        val plan = TransitionRehearsalPlan(opening = FADE, closing = null)
        assertThat(plan.phaseAt(1.7)).isEqualTo(TransitionRehearsalPlan.Phase.Hold)
        assertThat(plan.phaseAt(1.8)).isEqualTo(TransitionRehearsalPlan.Phase.Finished)
    }

    @Test
    fun `la pose suit la courbe de lecture puis revient au neutre`() {
        assertThat(both.poseAt(0.0).opacity).isWithin(1e-9).of(0.0)
        assertThat(both.poseAt(0.6).opacity).isWithin(1e-9).of(0.5)
        assertThat(both.poseAt(1.5)).isEqualTo(SceneRootPose.NEUTRAL)
        assertThat(both.poseAt(2.4).scale).isWithin(1e-9).of(1.04)
        assertThat(both.poseAt(3.5)).isEqualTo(SceneRootPose.NEUTRAL)
    }

    @Test
    fun `un plan sans effet est vide`() {
        assertThat(TransitionRehearsalPlan(null, null).isEmpty).isTrue()
        assertThat(both.isEmpty).isFalse()
    }

    @Test
    fun `l horloge demarre au premier tick et non a la creation`() {
        val run = TransitionRehearsalRun(both)
        assertThat(run.phaseAt(9_000_000_000_000L)).isEqualTo(TransitionRehearsalPlan.Phase.Opening)
        assertThat(run.poseAt(9_000_000_000_000L).opacity).isWithin(1e-9).of(0.0)
        assertThat(run.poseAt(9_000_000_000_000L + 600_000_000L).opacity).isWithin(1e-9).of(0.5)
        assertThat(run.phaseAt(9_000_000_000_000L + 3_100_000_000L)).isEqualTo(TransitionRehearsalPlan.Phase.Finished)
    }

    @Test
    fun `choisir un autre effet reprend de zero`() {
        val first = TransitionRehearsal.start(FADE, null)!!
        first.elapsedAt(0L)
        first.elapsedAt(1_000_000_000L)
        val second = TransitionRehearsal.start(ZOOM, null)!!
        assertThat(second.plan.opening).isEqualTo(ZOOM)
        assertThat(second.phaseAt(5_000_000_000L)).isEqualTo(TransitionRehearsalPlan.Phase.Opening)
    }

    @Test
    fun `sans effet ou hors mode edition rien ne se repete`() {
        assertThat(TransitionRehearsal.start(null, null)).isNull()
        assertThat(TransitionRehearsal.start(FADE, ZOOM, editing = false)).isNull()
    }
}
