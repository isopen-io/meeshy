package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryMediaTextMappingTest {

    private fun media(id: String, postMediaId: String) = StoryMediaObject(id = id, postMediaId = postMediaId)

    @Test
    fun `texts are re-keyed from the composer id to the PostMedia id`() {
        val keyed = StoryMediaTextMapping.serverKeyed(mapOf("c1" to "un chat"), listOf(media("c1", "pm1")))
        assertThat(keyed).containsExactly("pm1", "un chat")
    }

    @Test
    fun `an object whose upload failed is omitted`() {
        val keyed = StoryMediaTextMapping.serverKeyed(mapOf("c1" to "x", "c2" to "y"), listOf(media("c1", ""), media("c2", "pm2")))
        assertThat(keyed).containsExactly("pm2", "y")
    }

    @Test
    fun `an empty text is omitted`() {
        val keyed = StoryMediaTextMapping.serverKeyed(mapOf("c1" to ""), listOf(media("c1", "pm1")))
        assertThat(keyed).isEmpty()
    }

    @Test
    fun `a text with no object is dropped`() {
        assertThat(StoryMediaTextMapping.serverKeyed(mapOf("zz" to "t"), listOf(media("c1", "pm1")))).isEmpty()
    }
}
