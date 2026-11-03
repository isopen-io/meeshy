package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryStickerUploadTest {

    private fun sticker(id: String, postMediaId: String = "") = StorySticker(id = id, emoji = "🙂", postMediaId = postMediaId)

    @Test
    fun `a sticker without postMediaId but with a bitmap is sent`() {
        val ids = StoryStickerUpload.pendingUploadIds(listOf(sticker("a"), sticker("b")), setOf("a", "b"))
        assertThat(ids).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a sticker already carrying a postMediaId is never sent again`() {
        val ids = StoryStickerUpload.pendingUploadIds(listOf(sticker("a", "pm1"), sticker("b")), setOf("a", "b"))
        assertThat(ids).containsExactly("b")
    }

    @Test
    fun `an emoji sticker without a bitmap has nothing to send`() {
        assertThat(StoryStickerUpload.pendingUploadIds(listOf(sticker("a")), emptySet())).isEmpty()
    }

    @Test
    fun `applying assigns the uploaded id and leaves a failed sticker on its emoji`() {
        val result = StoryStickerUpload.applying(mapOf("a" to "pm1"), listOf(sticker("a"), sticker("b")))
        assertThat(result.map { it.postMediaId }).containsExactly("pm1", "").inOrder()
        assertThat(result[1].emoji).isEqualTo("🙂")
        assertThat(result[1].hasImage).isFalse()
    }

    @Test
    fun `applying treats an empty id as an absence`() {
        val result = StoryStickerUpload.applying(mapOf("a" to ""), listOf(sticker("a")))
        assertThat(result.single().hasImage).isFalse()
    }

    @Test
    fun `attachedPostMediaIds lists the media the stickers still reference`() {
        val ids = StoryStickerUpload.attachedPostMediaIds(listOf(sticker("a", "pm1"), sticker("b"), sticker("c", "pm3")))
        assertThat(ids).containsExactly("pm1", "pm3").inOrder()
    }

    @Test
    fun `a GIF keeps its animated container and mime`() {
        val gif = "GIF89a".toByteArray() + ByteArray(10)
        val container = AnimatedStickerContainer.of(gif)
        assertThat(container?.mimeType).isEqualTo("image/gif")
        assertThat(container?.fileExtension).isEqualTo("gif")
    }

    @Test
    fun `an APNG is recognised by its acTL chunk before the image data`() {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) +
            ByteArray(8) + "acTL".toByteArray() + ByteArray(8) + "IDAT".toByteArray()
        assertThat(AnimatedStickerContainer.of(png)?.mimeType).isEqualTo("image/apng")
    }

    @Test
    fun `a still PNG is not animated`() {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) +
            ByteArray(8) + "IDAT".toByteArray() + "acTL".toByteArray()
        assertThat(AnimatedStickerContainer.of(png)).isNull()
    }

    @Test
    fun `an animated WebP is recognised by its ANIM chunk`() {
        val webp = "RIFF".toByteArray() + ByteArray(4) + "WEBPVP8X".toByteArray() + ByteArray(10) + "ANIM".toByteArray()
        assertThat(AnimatedStickerContainer.of(webp)?.mimeType).isEqualTo("image/webp")
    }

    @Test
    fun `random bytes are not animated`() {
        assertThat(AnimatedStickerContainer.of(byteArrayOf(1, 2, 3))).isNull()
    }
}
