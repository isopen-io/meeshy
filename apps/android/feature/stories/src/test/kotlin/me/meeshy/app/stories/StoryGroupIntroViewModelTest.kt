package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import org.junit.Test

class StoryGroupIntroViewModelTest {
    private class Counter { var fetches = 0 }

    private fun viewModel(counter: Counter) = StoryGroupIntroViewModel(
        resolver = StoryGroupIntroResolver(
            cachedProfile = { null },
            fetchProfile = { counter.fetches++; null },
            storeProfile = { _, _ -> },
            moods = { emptyList() },
            nowMillis = { 0L },
        ),
        friends = mockk(relaxed = true),
        presence = mockk(relaxed = true),
        clock = object : CacheClock { override fun nowMillis(): Long = 0L },
    )

    private fun group(userId: String) = StoryGroupSlides(userId = userId, authorName = "Ada", slides = emptyList())

    @Test
    fun `le pre-chargement ne resout qu'une fois un auteur deja connu`() = runTest {
        val counter = Counter()
        val vm = viewModel(counter)

        vm.prefetch(listOf(group("u1"), group("u2")))
        vm.prefetch(listOf(group("u1"), group("u2")))

        assertThat(counter.fetches).isEqualTo(2)
    }

    @Test
    fun `un auteur pre-charge est servi complet des la premiere image`() = runTest {
        val vm = viewModel(Counter())

        vm.prefetch(listOf(group("u1")))

        assertThat(vm.immediate(group("u1"))).isEqualTo(vm.resolve(group("u1")))
    }
}
