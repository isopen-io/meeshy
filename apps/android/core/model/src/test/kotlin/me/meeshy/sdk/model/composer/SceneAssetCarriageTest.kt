package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

class SceneAssetCarriageTest {
    private fun slide(
        sounds: List<StoryAudioPlayerObject> = emptyList(),
        stickers: List<StorySticker> = emptyList(),
    ) = StoryEffects(audioPlayerObjects = sounds.ifEmpty { null }, stickerObjects = stickers.ifEmpty { null })

    private fun sound(id: String, url: String?, postMediaId: String = "") =
        StoryAudioPlayerObject(id = id, postMediaId = postMediaId, mediaURL = url)

    @Test
    fun `a local sound and an imported sticker are carried, sounds first`() {
        val pending = ComposerSceneAssetCarriage.pending(
            slides = listOf(slide(listOf(sound("s1", "file:///data/a.m4a")), listOf(StorySticker(id = "k1")))),
            stickerBitmapIds = setOf("k1"),
        )
        assertThat(pending).containsExactly(
            ComposerSceneAssetCarriage.Pending("s1", ComposerSceneAssetCarriage.Source.LocalFile("/data/a.m4a")),
            ComposerSceneAssetCarriage.Pending("k1", ComposerSceneAssetCarriage.Source.StickerBitmap),
        ).inOrder()
    }

    @Test
    fun `an object already uploaded or borrowed from the server is not carried`() {
        val pending = ComposerSceneAssetCarriage.pending(
            slides = listOf(
                slide(
                    sounds = listOf(sound("s1", "file:///a.m4a", postMediaId = "pm1"), sound("s2", "https://cdn/x.m4a")),
                    stickers = listOf(StorySticker(id = "k1", postMediaId = "pm2"), StorySticker(id = "k2")),
                ),
            ),
            stickerBitmapIds = setOf("k1", "k2"),
        )
        assertThat(pending.map { it.objectId }).containsExactly("k2")
    }

    @Test
    fun `an emoji sticker without bitmap carries nothing`() {
        val pending = ComposerSceneAssetCarriage.pending(listOf(slide(stickers = listOf(StorySticker(id = "k1")))), emptySet())
        assertThat(pending).isEmpty()
    }

    @Test
    fun `materialize bridges each written file to its scene object and drops an unwritable sticker`() {
        val pending = ComposerSceneAssetCarriage.pending(
            slides = listOf(slide(listOf(sound("s1", "/data/a.m4a")), listOf(StorySticker(id = "k1"), StorySticker(id = "k2")))),
            stickerBitmapIds = setOf("k1", "k2"),
        )
        val carried = CarriedSceneAssets.materialize(
            pending = pending,
            mimeTypeOf = { "audio/mp4" },
            writeSticker = { id -> if (id == "k1") WrittenSticker("/tmp/sticker_k1.gif", "image/gif") else null },
        )
        assertThat(carried.media.map { it.path to it.mimeType }).containsExactly(
            "/data/a.m4a" to "audio/mp4",
            "/tmp/sticker_k1.gif" to "image/gif",
        ).inOrder()
        assertThat(carried.objectIdBySource).containsExactly("/data/a.m4a", "s1", "/tmp/sticker_k1.gif", "k1")
    }

    @Test
    fun `carriedBy appends the files and the bridge to the draft without duplicating`() {
        val draft = ComposerDocumentDraft(ComposerFormat.POST, "x", StoryVisibility.PUBLIC, null)
        val carried = CarriedSceneAssets(
            listOf(ComposerDocumentMedia("/data/a.m4a", "audio/mp4")),
            mapOf("/data/a.m4a" to "s1"),
        )
        val once = carried.carriedBy(draft)
        val twice = carried.carriedBy(once)
        assertThat(once.localMedia.map { it.path }).containsExactly("/data/a.m4a")
        assertThat(once.mediaObjectIds).containsExactly("/data/a.m4a", "s1")
        assertThat(twice.localMedia).hasSize(1)
        assertThat(CarriedSceneAssets.EMPTY.carriedBy(draft)).isEqualTo(draft)
    }
}
