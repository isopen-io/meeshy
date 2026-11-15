package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EntityImageFormat
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/** La retouche d'une image d'identité (#17257) : un format imposé cadre la prise, et aucun preset ne le défait. */
class ComposerRetouchFormatTest {

    private fun photo() = ComposerRetouchState.opening(
        ComposerEditTake.Photo,
        renderableEffects = emptyList(),
        tools = listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT),
    )

    @Test
    fun `un format impose pose aussitot le cadre centre a ses proportions, et la prise part rendue`() {
        val banner = photo().lockingFormat(EntityImageFormat.BANNER, 3000, 3000)
        assertThat(banner.format).isEqualTo(EntityImageFormat.BANNER)
        assertThat(banner.crop).isEqualTo(EntityImageFormat.BANNER.centeredCrop(3000, 3000))
        assertThat(banner.cropPreset).isNull()
        assertThat(banner.delivery).isEqualTo(ComposerRetouchDelivery.RENDERED)
    }

    @Test
    fun `aucun preset ne defait le format`() {
        val avatar = photo().lockingFormat(EntityImageFormat.AVATAR, 4000, 3000)
        val tried = avatar.choosingPreset(ComposerCropPreset.LANDSCAPE, 4000, 3000)
        assertThat(tried).isEqualTo(avatar)
    }

    @Test
    fun `placer la prise sous le cadre garde la fenetre choisie, jamais un preset`() {
        val avatar = photo().lockingFormat(EntityImageFormat.AVATAR, 4000, 3000)
        val moved = NormalizedCrop(0f, 0f, 0.75f, 1f)
        val placed = avatar.cropping(moved, 4000, 3000)
        assertThat(placed.crop).isEqualTo(moved)
        assertThat(placed.cropPreset).isNull()
    }

    @Test
    fun `la prise entiere redemandee retombe sur le cadre du format`() {
        val avatar = photo().lockingFormat(EntityImageFormat.AVATAR, 4000, 3000)
        val whole = avatar.cropping(null, 4000, 3000)
        assertThat(whole.crop).isEqualTo(EntityImageFormat.AVATAR.centeredCrop(4000, 3000))
    }

    @Test
    fun `sans format, la retouche de la capture reste libre`() {
        assertThat(photo().format).isNull()
        assertThat(photo().choosingPreset(ComposerCropPreset.SQUARE, 4000, 3000).cropPreset).isEqualTo(ComposerCropPreset.SQUARE)
    }
}
