package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryMediaPinPolicyTest {
    @Test
    fun `les medias distincts d'une story vivante sont epingles`() {
        val urls = StoryMediaPinPolicy.urlsToPin(listOf("a", null, "a", "", "b"), 1_000, 10)
        assertThat(urls).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une story expiree ou sans echeance n'epingle rien`() {
        assertThat(StoryMediaPinPolicy.urlsToPin(listOf("a"), 10, 10)).isEmpty()
        assertThat(StoryMediaPinPolicy.urlsToPin(listOf("a"), null, 10)).isEmpty()
    }
}
