package me.meeshy.ui.component.comments

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MAX_POST_MEDIA
import org.junit.Test

class CommentCameraDoorTest {

    @Test
    fun `ouvrir previent l hote une fois`() {
        var opened = 0
        val door = CommentCameraDoor(onOpen = { opened++ })
        assertThat(door.open(stagedCount = 0)).isTrue()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `la porte partage le plafond du serveur et reste close zone pleine`() {
        var opened = 0
        val door = CommentCameraDoor(onOpen = { opened++ })
        assertThat(door.limit).isEqualTo(MAX_POST_MEDIA)
        assertThat(door.open(stagedCount = MAX_POST_MEDIA)).isFalse()
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `une zone a une piece reste ouvrable car la prise remplace`() {
        val door = CommentCameraDoor(limit = 1, onOpen = {})
        assertThat(door.isOpenable(stagedCount = 1)).isTrue()
    }
}
