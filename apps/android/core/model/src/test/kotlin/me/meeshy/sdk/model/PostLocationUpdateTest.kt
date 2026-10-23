package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostLocationUpdateTest {
    @Test
    fun `les trois etats sont distincts`() {
        val set: PostLocationUpdate = PostLocationUpdate.Set(SharedPlace(1.0, 2.0, name = "Paris"))
        val states: List<PostLocationUpdate?> = listOf(null, PostLocationUpdate.Remove, set)
        assertThat(states.toSet()).hasSize(3)
    }
}
