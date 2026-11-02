package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.conversations.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The pinned section is a section TITLE, written like « My conversations » — not the
 * lowercase accessibility adjective « pinned » / « épinglé » a row's pin glyph speaks.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationSectionTitleTest {

    private fun title(): String =
        RuntimeEnvironment.getApplication().getString(R.string.conversations_section_pinned)

    @Test
    fun `the pinned section is titled like a section in english`() {
        assertThat(title()).isEqualTo("Pinned")
    }

    @Test
    @Config(qualifiers = "fr")
    fun `the pinned section is titled like a section in french`() {
        assertThat(title()).isEqualTo("Épinglées")
    }

    @Test
    fun `the row pin glyph keeps its own accessibility label`() {
        val context = RuntimeEnvironment.getApplication()
        assertThat(context.getString(R.string.conversations_badge_pinned)).isEqualTo("pinned")
    }
}
