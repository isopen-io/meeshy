package me.meeshy.sdk.model.imagine

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImagineWorkshopGesturesTest {

    private val excerpt = ImagineExcerpt(totalSeconds = 100.0, startSeconds = 20.0, windowSeconds = 30.0, soundId = "a")

    @Test
    fun `a pinch is bounded between half and double`() {
        assertThat(ImagineScales.Identity.pinched(ImaginePartId.REPLY, 5.0)).isEqualTo(2.0)
        assertThat(ImagineScales.Identity.pinched(ImaginePartId.REPLY, 0.1)).isEqualTo(0.5)
        assertThat(ImagineScales.Identity.pinched(ImaginePartId.REPLY, 1.5)).isEqualTo(1.5)
    }

    @Test
    fun `a pinch near one hundred percent snaps back to the identity`() {
        val scales = ImagineScales.Identity.with(ImaginePartId.MEDIA, 1.03)
        assertThat(scales.isIdentity).isTrue()
        assertThat(scales[ImaginePartId.MEDIA]).isEqualTo(1.0)
        assertThat(ImagineScales.Identity.with(ImaginePartId.MEDIA, 1.2)[ImaginePartId.MEDIA]).isEqualTo(1.2)
    }

    @Test
    fun `the link and the background have no size of their own`() {
        assertThat(ImagineScales.Identity.with(ImaginePartId.BACKGROUND, 1.5).isIdentity).isTrue()
        assertThat(ImagineScales.Identity.with(ImaginePartId.LINK, 1.5).isIdentity).isTrue()
        assertThat(ImagineScales.Identity.with(ImaginePartId.HEADER, Double.NaN).isIdentity).isTrue()
    }

    @Test
    fun `the card limit caps what a pinch promises`() {
        val big = ImagineScales.Identity.with(ImaginePartId.MEDIA, 1.8)
        assertThat(big.pinched(ImaginePartId.MEDIA, 1.0, limit = 1.4)).isEqualTo(1.4)
        assertThat(big.pinched(ImaginePartId.MEDIA, 2.0, limit = 1.4)).isEqualTo(1.4)
        assertThat(big.pinched(ImaginePartId.MEDIA, -1.0, limit = 1.4)).isEqualTo(1.4)
        assertThat(big.pinch(ImaginePartId.MEDIA, 0.5).get(ImaginePartId.MEDIA)).isEqualTo(0.9)
    }

    @Test
    fun `an accessibility step multiplies by one point one`() {
        val up = ImagineScales.Identity.stepped(ImaginePartId.REPLY, increase = true)
        assertThat(up[ImaginePartId.REPLY]).isWithin(1e-9).of(1.1)
        assertThat(up.stepped(ImaginePartId.REPLY, increase = false).isIdentity).isTrue()
    }

    @Test
    fun `scales survive their stored form and ignore the unknown`() {
        val scales = ImagineScales.Identity.with(ImaginePartId.QUOTE, 0.7).with(ImaginePartId.TRANSCRIPT, 1.6)
        assertThat(ImagineScales.fromStored(scales.stored())).isEqualTo(scales)
        assertThat(ImagineScales.fromStored(mapOf("nope" to 2.0, "reply" to Double.NaN))).isEqualTo(ImagineScales.Identity)
        assertThat(ImagineScales.fromStored(null).isIdentity).isTrue()
    }

    @Test
    fun `the excerpt window is clamped inside the media`() {
        assertThat(ImagineExcerptGesture.clamped(excerpt, -5.0)).isEqualTo(0.0)
        assertThat(ImagineExcerptGesture.clamped(excerpt, 99.0)).isEqualTo(70.0)
        assertThat(ImagineExcerptGesture.latestStart(excerpt)).isEqualTo(70.0)
    }

    @Test
    fun `dragging moves the window by a fraction of the strip - left to right whatever the language`() {
        assertThat(ImagineExcerptGesture.isLeftToRight).isTrue()
        assertThat(ImagineExcerptGesture.dragged(excerpt, 20.0, 0.1)).isEqualTo(30.0)
        assertThat(ImagineExcerptGesture.dragged(excerpt, 20.0, -0.5)).isEqualTo(0.0)
    }

    @Test
    fun `a tap centres the window where it falls`() {
        assertThat(ImagineExcerptGesture.tapped(excerpt, 0.5)).isEqualTo(35.0)
        assertThat(ImagineExcerptGesture.isTap(0.001)).isTrue()
        assertThat(ImagineExcerptGesture.isTap(0.2)).isFalse()
    }

    @Test
    fun `a move that is too small does not repaint the card`() {
        assertThat(ImagineExcerptGesture.committed(excerpt, 20.01)).isNull()
        assertThat(ImagineExcerptGesture.committed(excerpt, 25.0)).isEqualTo(25.0)
    }

    @Test
    fun `the accessibility step is five seconds and stops at the edges`() {
        assertThat(ImagineExcerptGesture.stepped(excerpt, increase = true)).isEqualTo(25.0)
        assertThat(ImagineExcerptGesture.stepped(excerpt, increase = false)).isEqualTo(15.0)
        val atStart = excerpt.copy(startSeconds = 0.0)
        assertThat(ImagineExcerptGesture.stepped(atStart, increase = false)).isNull()
    }

    @Test
    fun `the strip levels are a ruler for a video and the resampled wave for a sound`() {
        val video = excerpt.copy(soundId = null)
        assertThat(ImagineExcerptGesture.levels(video, emptyList(), 4)).containsExactly(0.3, 0.3, 0.3, 0.3)
        assertThat(ImagineExcerptGesture.levels(excerpt, listOf(0.0, 1.0, 0.5, 0.5), 2)).containsExactly(0.5, 0.5).inOrder()
        val synthetic = ImagineExcerptGesture.levels(excerpt, emptyList(), 12)
        assertThat(synthetic).hasSize(12)
        assertThat(synthetic).isEqualTo(ImagineWaveform.synthetic("a", 12))
        assertThat(synthetic.all { it in 0.18..1.0 }).isTrue()
    }

    @Test
    fun `gallery search matches word prefixes without case or accents`() {
        val plume = ImagineTemplateEntry(ImagineTemplateRef(0, 0, 0), listOf("Plume", "Élégante", "sombre"), tone = "dark")
        val aube = ImagineTemplateEntry(ImagineTemplateRef(1, 0, 0), listOf("Aube", "Moderne", "clair"), tone = "light")
        val entries = listOf(plume, aube)
        assertThat(ImagineGallerySearch.search("pl sombre", entries)).containsExactly(plume.ref)
        assertThat(ImagineGallerySearch.search("ELEG", entries)).containsExactly(plume.ref)
        assertThat(ImagineGallerySearch.search("", entries)).containsExactly(plume.ref, aube.ref).inOrder()
        assertThat(ImagineGallerySearch.search("", entries, tone = "light")).containsExactly(aube.ref)
        assertThat(ImagineGallerySearch.search("zzz", entries)).isEmpty()
    }

    @Test
    fun `the most used templates come first then the gallery order`() {
        val a = ImagineTemplateEntry(ImagineTemplateRef(0, 0, 0), listOf("a"))
        val b = ImagineTemplateEntry(ImagineTemplateRef(1, 0, 0), listOf("b"))
        val c = ImagineTemplateEntry(ImagineTemplateRef(2, 0, 0), listOf("c"))
        val ordered = ImagineGallerySearch.search("", listOf(a, b, c), usage = mapOf(c.ref to 5, b.ref to 2))
        assertThat(ordered).containsExactly(c.ref, b.ref, a.ref).inOrder()
    }

    @Test
    fun `the gallery shuffle is a bijection where neighbours differ`() {
        val order = ImagineGallerySearch.galleryOrder(palettes = 7, typefaces = 4, links = 4)
        assertThat(order).hasSize(112)
        assertThat(order.toSet()).hasSize(112)
        assertThat(ImagineGallerySearch.galleryOrder(0, 4, 4)).isEmpty()
    }
}
