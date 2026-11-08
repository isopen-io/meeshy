package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentEditingTest {
    @Test
    fun `an unchanged draft sends nothing`() {
        assertThat(StoryCommentEditing.draftToSend("  Salut ", "Salut")).isNull()
    }

    @Test
    fun `an empty draft sends nothing`() {
        assertThat(StoryCommentEditing.draftToSend("   ", "Salut")).isNull()
    }

    @Test
    fun `a changed draft is sent trimmed`() {
        assertThat(StoryCommentEditing.draftToSend(" Salut tous ", "Salut")).isEqualTo("Salut tous")
    }
}
