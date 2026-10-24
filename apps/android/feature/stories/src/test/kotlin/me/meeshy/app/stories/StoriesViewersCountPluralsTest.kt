package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Le compteur de spectateurs d'une story est un vrai pluriel CLDR : le français range 0 et 1
 * au singulier, l'arabe distingue zéro, un, deux, quelques-uns et beaucoup.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoriesViewersCountPluralsTest {

    private fun label(count: Int): String =
        RuntimeEnvironment.getApplication().resources.getQuantityString(R.plurals.stories_viewers_count, count, count)

    @Test
    @Config(qualifiers = "fr")
    fun `in French zero and one view are singular and two or eleven are plural`() {
        assertThat(label(0)).isEqualTo("0 vue")
        assertThat(label(1)).isEqualTo("1 vue")
        assertThat(label(2)).isEqualTo("2 vues")
        assertThat(label(11)).isEqualTo("11 vues")
    }

    @Test
    @Config(qualifiers = "ar")
    fun `in Arabic zero one two and eleven each take their own form`() {
        assertThat(label(0)).endsWith("مشاهدات")
        assertThat(label(1)).endsWith("مشاهدة")
        assertThat(label(2)).endsWith("مشاهدتان")
        assertThat(label(11)).endsWith("مشاهدات")
        assertThat(label(1)).isNotEqualTo(label(2))
    }

    @Test
    @Config(qualifiers = "en")
    fun `in English one view is singular and the rest plural`() {
        assertThat(label(1)).isEqualTo("1 view")
        assertThat(label(0)).isEqualTo("0 views")
    }
}
