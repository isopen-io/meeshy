package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.StoryTransitionEffect
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerRehearsalsTest {

    @Test
    fun `choisir un effet rejoue la repetition et le dernier choix remplace le precedent`() = runTest(UnconfinedTestDispatcher()) {
        val rehearsals = ComposerRehearsals()
        val seen = mutableListOf<StoryTransitionEffect?>()
        val job = launch { rehearsals.runs.collect { seen += it.plan.opening } }
        rehearsals.rehearse(StoryTransitionEffect.FADE, null)
        rehearsals.rehearse(StoryTransitionEffect.ZOOM, null)
        assertThat(seen).containsExactly(StoryTransitionEffect.FADE, StoryTransitionEffect.ZOOM).inOrder()
        job.cancel()
    }

    @Test
    fun `sans effet choisi rien ne se repete`() = runTest(UnconfinedTestDispatcher()) {
        val rehearsals = ComposerRehearsals()
        var count = 0
        val job = launch { rehearsals.runs.collect { count++ } }
        rehearsals.rehearse(null, null)
        assertThat(count).isEqualTo(0)
        job.cancel()
    }
}
