package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPrismeMatchTest {
    @Test
    fun `case and region collapse to the base code`() {
        assertThat(StoryPrismeMatch.base("en-US")).isEqualTo("en")
        assertThat(StoryPrismeMatch.base("FR")).isEqualTo("fr")
        assertThat(StoryPrismeMatch.base("pt_BR")).isEqualTo("pt")
    }
}
