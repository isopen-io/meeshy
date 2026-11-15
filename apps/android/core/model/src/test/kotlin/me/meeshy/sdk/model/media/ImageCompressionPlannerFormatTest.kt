package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageCompressionPlannerFormatTest {

    private fun bytes(vararg values: Int): ByteArray = ByteArray(32).also { header ->
        values.forEachIndexed { index, value -> header[index] = value.toByte() }
    }

    private fun jpeg() = bytes(0xFF, 0xD8, 0xFF, 0xE0)
    private fun png() = bytes(0x89, 0x50, 0x4E, 0x47)
    private fun gif() = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
    private fun webp(flags: Int = 0) = bytes(
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, flags,
    )
    private fun heic() = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63)

    private fun plan(
        format: ImageSourceFormat,
        width: Int = 4000,
        height: Int = 3000,
        animated: Boolean = false,
        context: ImageUploadContext = ImageUploadContext.MESSAGE,
    ) = ImageCompressionPlanner.planFor(
        source = ImageSource(format = format, widthPx = width, heightPx = height, animated = animated),
        context = context,
    )

    @Test
    fun `les signatures des formats courants sont reconnues dans les octets`() {
        assertThat(ImageSourceFormat.sniff(jpeg())).isEqualTo(ImageSourceFormat.JPEG)
        assertThat(ImageSourceFormat.sniff(png())).isEqualTo(ImageSourceFormat.PNG)
        assertThat(ImageSourceFormat.sniff(gif())).isEqualTo(ImageSourceFormat.GIF)
        assertThat(ImageSourceFormat.sniff(webp())).isEqualTo(ImageSourceFormat.WEBP)
        assertThat(ImageSourceFormat.sniff(heic())).isEqualTo(ImageSourceFormat.HEIC)
        assertThat(ImageSourceFormat.sniff(ByteArray(4))).isEqualTo(ImageSourceFormat.UNKNOWN)
    }

    @Test
    fun `un webp dont le drapeau d'animation est levé est animé`() {
        assertThat(ImageSourceFormat.isAnimated(webp(flags = 0x02), ImageSourceFormat.WEBP)).isTrue()
        assertThat(ImageSourceFormat.isAnimated(webp(flags = 0), ImageSourceFormat.WEBP)).isFalse()
    }

    @Test
    fun `un gif avec plusieurs images est animé`() {
        val gce = intArrayOf(0x00, 0x21, 0xF9, 0x04)
        val animated = gif() + ByteArray(0) + gce.map { it.toByte() } + gce.map { it.toByte() }
        assertThat(ImageSourceFormat.isAnimated(animated, ImageSourceFormat.GIF)).isTrue()
        assertThat(ImageSourceFormat.isAnimated(gif(), ImageSourceFormat.GIF)).isFalse()
    }

    @Test
    fun `un gif passe tel quel même au dessus du plafond`() {
        val plan = plan(ImageSourceFormat.GIF, animated = true)
        assertThat(plan.passthrough).isTrue()
        assertThat(plan.outputFormat).isEqualTo(ImageOutputFormat.GIF)
        assertThat(plan.outputFormat.mimeType).isEqualTo("image/gif")
        assertThat(plan.outputFormat.fileExtension).isEqualTo("gif")
    }

    @Test
    fun `un webp animé passe tel quel`() {
        val plan = plan(ImageSourceFormat.WEBP, animated = true)
        assertThat(plan.passthrough).isTrue()
        assertThat(plan.outputFormat).isEqualTo(ImageOutputFormat.WEBP)
    }

    @Test
    fun `un webp statique trop grand est réduit et reste webp`() {
        val plan = plan(ImageSourceFormat.WEBP)
        assertThat(plan.passthrough).isFalse()
        assertThat(plan.resizeRequired).isTrue()
        assertThat(plan.targetWidthPx).isEqualTo(1200)
        assertThat(plan.outputFormat.mimeType).isEqualTo("image/webp")
        assertThat(plan.outputFormat.fileExtension).isEqualTo("webp")
    }

    @Test
    fun `un png dans le plafond reste intact`() {
        val plan = plan(ImageSourceFormat.PNG, width = 800, height = 600)
        assertThat(plan.passthrough).isTrue()
        assertThat(plan.outputFormat).isEqualTo(ImageOutputFormat.PNG)
    }

    @Test
    fun `un png trop grand est réduit et reste png`() {
        val plan = plan(ImageSourceFormat.PNG, context = ImageUploadContext.AVATAR)
        assertThat(plan.passthrough).isFalse()
        assertThat(plan.targetWidthPx).isEqualTo(512)
        assertThat(plan.targetHeightPx).isEqualTo(384)
        assertThat(plan.outputFormat.fileExtension).isEqualTo("png")
    }

    @Test
    fun `un jpeg est ré encodé en jpeg pour cuire l'orientation`() {
        val plan = plan(ImageSourceFormat.JPEG, width = 800, height = 600)
        assertThat(plan.passthrough).isFalse()
        assertThat(plan.resizeRequired).isFalse()
        assertThat(plan.outputFormat.mimeType).isEqualTo("image/jpeg")
        assertThat(plan.outputFormat.fileExtension).isEqualTo("jpg")
    }

    @Test
    fun `un heic ou un format inconnu devient un vrai jpeg`() {
        assertThat(plan(ImageSourceFormat.HEIC).outputFormat).isEqualTo(ImageOutputFormat.JPEG)
        assertThat(plan(ImageSourceFormat.UNKNOWN).outputFormat).isEqualTo(ImageOutputFormat.JPEG)
    }

    @Test
    fun `les plafonds par contexte s'appliquent à chaque format`() {
        val expected = mapOf(
            ImageUploadContext.MESSAGE to 1200,
            ImageUploadContext.STORY to 1080,
            ImageUploadContext.FEED_POST to 1600,
            ImageUploadContext.AVATAR to 512,
            ImageUploadContext.FULLSCREEN to 2048,
        )
        expected.forEach { (context, ceiling) ->
            val plan = plan(ImageSourceFormat.JPEG, width = 4096, height = 2048, context = context)
            assertThat(plan.targetWidthPx).isEqualTo(ceiling)
        }
    }
}
