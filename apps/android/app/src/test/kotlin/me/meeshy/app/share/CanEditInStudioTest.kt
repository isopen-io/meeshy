package me.meeshy.app.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import org.junit.Test

class CanEditInStudioTest {

    private fun file(name: String, mime: String): MediaUploadItem = MediaUploadItem(byteArrayOf(1), name, mime)

    @Test
    fun a_document_in_the_selection_keeps_the_studio_offer_away_but_photos_and_videos_keep_it() {
        assertThat(canEditInStudio(listOf(file("a.jpg", "image/jpeg"), file("b.mp4", "video/mp4")))).isTrue()
        assertThat(canEditInStudio(listOf(file("a.jpg", "image/jpeg"), file("c.pdf", "application/pdf")))).isFalse()
        assertThat(canEditInStudio(listOf(file("c.pdf", "application/pdf")))).isFalse()
        assertThat(canEditInStudio(emptyList())).isFalse()
    }
}
