package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StorySlideTransitionLockTest {
    @Test
    fun `un tap pendant la transition est ignore puis le verrou se libere`() {
        val lock = StorySlideTransitionLock()
        assertThat(lock.tryBegin()).isTrue()
        assertThat(lock.tryBegin()).isFalse()
        lock.end()
        assertThat(lock.tryBegin()).isTrue()
    }
}
