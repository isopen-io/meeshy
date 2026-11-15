package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.theme.ChromeScheme
import org.junit.Test

class StoryReaderChromeSchemeTest {
    @Test
    fun `un fond sombre donne un chrome blanc`() {
        assertThat(StoryReaderChromeScheme.resolve("000000", false)).isEqualTo(ChromeScheme.Dark)
    }

    @Test
    fun `un fond clair donne un chrome sombre`() {
        assertThat(StoryReaderChromeScheme.resolve("FFFFFF", false)).isEqualTo(ChromeScheme.Light)
    }

    @Test
    fun `un fond media clair suit la luminance mesuree et sombre par defaut`() {
        assertThat(StoryReaderChromeScheme.resolve(null, true, 0.8)).isEqualTo(ChromeScheme.Light)
        assertThat(StoryReaderChromeScheme.resolve(null, true, 0.1)).isEqualTo(ChromeScheme.Dark)
        assertThat(StoryReaderChromeScheme.resolve(null, true)).isEqualTo(ChromeScheme.Dark)
    }
}
