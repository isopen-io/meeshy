package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

class StoryCoverRenderSignalTest {

    @Test
    fun `une couverture rendue invalide la memoire et fait avancer la generation`() {
        val memo = StoryCoverMemo()
        val signal = StoryCoverRenderSignal(memo)
        val group = StoryGroup(id = "u", stories = listOf(StoryItem(id = "s1")))
        assertThat(memo.coverUrl(group, "me") { null }).isNull()
        assertThat(memo.coverUrl(group, "me") { "/disk/s1.jpg" }).isNull()
        signal.bump()
        assertThat(signal.generation.value).isEqualTo(1)
        assertThat(memo.coverUrl(group, "me") { "/disk/s1.jpg" }).isEqualTo("/disk/s1.jpg")
    }
}
