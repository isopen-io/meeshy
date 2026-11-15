package me.meeshy.sdk.model.imagine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import org.junit.Test

class ImagineTrayOfferTest {

    private fun photo(id: String = "p") = ImagineMedia(id, ImagineMediaKind.IMAGE, "https://x/$id")
    private fun film(duration: Double?) = ImagineMedia("v", ImagineMediaKind.VIDEO, "https://x/v", durationSeconds = duration)
    private fun voice(duration: Double?, transcript: String? = "Bonjour") =
        ImagineMedia("a", ImagineMediaKind.AUDIO, "https://x/a", durationSeconds = duration, transcript = transcript)

    private val plain = ImagineTrayFormat()

    @Test
    fun `frame comes before the background and media or language tabs need their content`() {
        val tabs = ImagineTab.offered(hasMedia = true, languageCount = 2)
        assertThat(tabs).containsExactly(
            ImagineTab.STYLES, ImagineTab.FORMAT, ImagineTab.FRAME, ImagineTab.PALETTE, ImagineTab.TYPEFACE,
            ImagineTab.LINK, ImagineTab.MEDIA, ImagineTab.DETAILS, ImagineTab.LANGUAGE,
        ).inOrder()
        val bare = ImagineTab.offered(hasMedia = false, languageCount = 1)
        assertThat(bare).containsNoneOf(ImagineTab.MEDIA, ImagineTab.LANGUAGE)
    }

    @Test
    fun `touching a part opens the tab that sets it`() {
        assertThat(ImagineTab.of(ImaginePartId.HEADER)).isEqualTo(ImagineTab.FRAME)
        assertThat(ImagineTab.of(ImaginePartId.TRANSCRIPT)).isEqualTo(ImagineTab.MEDIA)
        assertThat(ImagineTab.of(ImaginePartId.BACKGROUND)).isEqualTo(ImagineTab.PALETTE)
        assertThat(ImagineTab.of(ImaginePartId.REPLY)).isEqualTo(ImagineTab.TYPEFACE)
        assertThat(ImagineTab.of(ImaginePartId.LINK)).isEqualTo(ImagineTab.LINK)
    }

    @Test
    fun `the header orientation exists only with a header to orient`() {
        assertThat(ImagineTrayOffer.offersHeaderOrientation(plain, hasTitle = true)).isFalse()
        assertThat(ImagineTrayOffer.offersHeaderOrientation(plain.copy(showDate = true), hasTitle = false)).isTrue()
        assertThat(ImagineTrayOffer.offersHeaderOrientation(plain.copy(showConversationTitle = true), hasTitle = false)).isFalse()
        assertThat(ImagineTrayOffer.offersHeaderOrientation(plain.copy(showConversationTitle = true), hasTitle = true)).isTrue()
    }

    @Test
    fun `the names placement exists only with a name or time line`() {
        assertThat(ImagineTrayOffer.offersNamesPlacement(plain.copy(showAuthors = false))).isFalse()
        assertThat(ImagineTrayOffer.offersNamesPlacement(plain.copy(showAuthors = false, showTimes = true))).isTrue()
    }

    @Test
    fun `arrangements exist from two visuals and never on a backdrop`() {
        val one = listOf(ImagineMediaKind.IMAGE, ImagineMediaKind.AUDIO)
        val two = listOf(ImagineMediaKind.IMAGE, ImagineMediaKind.VIDEO)
        assertThat(ImagineTrayOffer.offersArrangements(plain, one)).isFalse()
        assertThat(ImagineTrayOffer.offersArrangements(plain, two)).isTrue()
        assertThat(ImagineTrayOffer.offersArrangements(plain.copy(mediaIsBackdrop = true), two)).isFalse()
        assertThat(ImagineTrayOffer.offersMediaLayouts(listOf(ImagineMediaKind.AUDIO))).isFalse()
        assertThat(ImagineTrayOffer.offersMediaLayouts(one)).isTrue()
    }

    @Test
    fun `the shown visual is chosen for one or a backdrop - not for a grid`() {
        val media = listOf(photo("p1"), film(5.0), photo("p2"))
        assertThat(ImagineTrayOffer.featuredChoices(plain, media)).isEmpty()
        assertThat(ImagineTrayOffer.featuredChoices(plain.copy(arrangementIsSingle = true), media)).hasSize(3)
        assertThat(ImagineTrayOffer.featuredChoices(plain.copy(mediaIsBackdrop = true), media)).hasSize(3)
        assertThat(ImagineTrayOffer.featuredChoices(plain.copy(mediaIsBackdrop = true), listOf(photo()))).isEmpty()
    }

    @Test
    fun `the media author is offered off the backdrop when someone is known`() {
        assertThat(ImagineTrayOffer.offersMediaAuthor(plain, true)).isTrue()
        assertThat(ImagineTrayOffer.offersMediaAuthor(plain, false)).isFalse()
        assertThat(ImagineTrayOffer.offersMediaAuthor(plain.copy(mediaIsBackdrop = true), true)).isFalse()
    }

    @Test
    fun `the transcript and the timer need a sound - the font needs a shown transcript`() {
        val spoken = listOf(voice(30.0))
        assertThat(ImagineTrayOffer.offersTranscript(spoken)).isTrue()
        assertThat(ImagineTrayOffer.offersTimer(spoken)).isTrue()
        assertThat(ImagineTrayOffer.offersTranscriptTypefaces(plain, spoken)).isTrue()
        assertThat(ImagineTrayOffer.offersTranscriptTypefaces(plain.copy(showsTranscript = false), spoken)).isFalse()
        assertThat(ImagineTrayOffer.offersTranscript(listOf(voice(30.0, transcript = null)))).isFalse()
        assertThat(ImagineTrayOffer.offersTimer(listOf(photo()))).isFalse()
    }

    @Test
    fun `the outputs follow the media`() {
        assertThat(ImagineOutput.offered(listOf(ImagineMediaKind.VIDEO))).containsExactly(ImagineOutput.IMAGE, ImagineOutput.GIF, ImagineOutput.VIDEO).inOrder()
        assertThat(ImagineOutput.offered(listOf(ImagineMediaKind.AUDIO))).containsExactly(ImagineOutput.IMAGE, ImagineOutput.VIDEO).inOrder()
        assertThat(ImagineOutput.offered(listOf(ImagineMediaKind.IMAGE))).containsExactly(ImagineOutput.IMAGE)
        assertThat(ImagineOutput.offered(emptyList())).containsExactly(ImagineOutput.IMAGE)
    }

    @Test
    fun `clip lengths come from a sound only in video and under a minute`() {
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.IMAGE, listOf(voice(55.0)))).isEmpty()
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.VIDEO, listOf(voice(55.0))))
            .containsExactly(ImagineClipLength.FIFTEEN_SECONDS, ImagineClipLength.THIRTY_SECONDS, ImagineClipLength.ONE_MINUTE)
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.VIDEO, listOf(voice(20.0))))
            .containsExactly(ImagineClipLength.FIFTEEN_SECONDS, ImagineClipLength.THIRTY_SECONDS)
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.VIDEO, listOf(voice(9.0)))).isEmpty()
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.VIDEO, listOf(film(40.0), voice(90.0)))).isEmpty()
    }

    @Test
    fun `over a minute the quarters replace the excerpt lengths`() {
        val long = listOf(voice(240.0))
        val quarters = ImagineTrayOffer.clipQuarters(ImagineOutput.VIDEO, long)
        assertThat(quarters.map { it.quarter }).containsExactly(ImagerQuarter.ONE, ImagerQuarter.TWO, ImagerQuarter.THREE, ImagerQuarter.FOUR).inOrder()
        assertThat(quarters.map { it.durationMillis }).containsExactly(60_000L, 120_000L, 180_000L, 240_000L).inOrder()
        assertThat(ImagineTrayOffer.clipLengths(ImagineOutput.VIDEO, long)).isEmpty()
        assertThat(ImagineTrayOffer.clipQuarters(ImagineOutput.GIF, listOf(film(90.0)))).isEmpty()
        assertThat(ImagineTrayOffer.clipQuarters(ImagineOutput.IMAGE, long)).isEmpty()
        assertThat(ImagineTrayOffer.clipQuarters(ImagineOutput.VIDEO, listOf(voice(60.0)))).isEmpty()
        assertThat(ImagineTrayOffer.clipQuarters(ImagineOutput.VIDEO, listOf(film(90.0))).map { it.durationMillis })
            .containsExactly(22_500L, 45_000L, 67_500L, 90_000L).inOrder()
    }

    @Test
    fun `a quarter of a long sound renders from the start`() {
        val long = listOf(voice(240.0))
        val half = ImagineMotionPlan.of(ImagineOutput.VIDEO, long, ImagineClipLength.FIFTEEN_SECONDS, ImagerQuarter.TWO, startSeconds = 50.0)!!
        assertThat(half.durationSeconds).isEqualTo(120.0)
        assertThat(half.startSeconds).isEqualTo(0.0)
        assertThat(ImagineTrayOffer.excerpt(half, long)).isNull()
        val short = ImagineMotionPlan.of(ImagineOutput.VIDEO, listOf(voice(45.0)), ImagineClipLength.THIRTY_SECONDS, ImagerQuarter.TWO)!!
        assertThat(short.durationSeconds).isEqualTo(30.0)
        val quarterOfFilm = ImagineMotionPlan.of(ImagineOutput.VIDEO, listOf(film(240.0)), quarter = ImagerQuarter.ONE, startSeconds = 30.0)!!
        assertThat(quarterOfFilm.durationSeconds).isEqualTo(60.0)
        assertThat(quarterOfFilm.fps).isEqualTo(15.0)
    }

    @Test
    fun `the plan of a still image or an unoffered output is null`() {
        assertThat(ImagineMotionPlan.of(ImagineOutput.IMAGE, listOf(film(10.0)))).isNull()
        assertThat(ImagineMotionPlan.of(ImagineOutput.GIF, listOf(voice(10.0)))).isNull()
        val gif = ImagineMotionPlan.of(ImagineOutput.GIF, listOf(film(40.0)), startSeconds = 10.0)!!
        assertThat(gif.clip).isEqualTo(ImagineClip(10.0, 6.0))
        assertThat(gif.scale).isEqualTo(0.5)
        assertThat(gif.pixelSize(1081.0, 1921.0)).isEqualTo(540 to 960)
    }

    @Test
    fun `the passage is chosen only when the media outlasts the excerpt`() {
        val long = listOf(voice(55.0))
        val plan = ImagineMotionPlan.of(ImagineOutput.VIDEO, long, ImagineClipLength.THIRTY_SECONDS, startSeconds = 40.0)!!
        val excerpt = ImagineTrayOffer.excerpt(plan, long)!!
        assertThat(excerpt.totalSeconds).isEqualTo(55.0)
        assertThat(excerpt.startSeconds).isEqualTo(25.0)
        assertThat(excerpt.windowSeconds).isEqualTo(30.0)
        assertThat(excerpt.soundId).isEqualTo("a")

        val short = listOf(voice(20.0))
        assertThat(ImagineTrayOffer.excerpt(ImagineMotionPlan.of(ImagineOutput.VIDEO, short), short)).isNull()
        assertThat(ImagineTrayOffer.excerpt(null, long)).isNull()

        val clip = listOf(film(40.0))
        val gif = ImagineTrayOffer.excerpt(ImagineMotionPlan.of(ImagineOutput.GIF, clip, startSeconds = 10.0), clip)!!
        assertThat(gif.windowSeconds).isEqualTo(6.0)
        assertThat(gif.soundId).isNull()
        assertThat(ImagineExcerptGesture.levels(gif, emptyList(), 8).toSet()).hasSize(1)
    }

    @Test
    fun `clip length selection reads a saved longer choice on the one that takes the whole sound`() {
        val offered = ImagineClipLength.offered(20.0)
        assertThat(ImagineClipLength.ONE_MINUTE.selected(offered, 20.0)).isEqualTo(ImagineClipLength.THIRTY_SECONDS)
        assertThat(ImagineClipLength.FIFTEEN_SECONDS.selected(offered, 20.0)).isEqualTo(ImagineClipLength.FIFTEEN_SECONDS)
    }

    @Test
    fun `the paint key changes with anything that changes the image and nothing else`() {
        val base = ImaginePaintKey("f", "p1", "fr", 0, null)
        assertThat(base.isReady(ImaginePaintKey("f", "p1", "fr", 0, null))).isTrue()
        assertThat(base.isReady(ImaginePaintKey("f", "p2", "fr", 0, null))).isFalse()
        assertThat(base.isReady(ImaginePaintKey("f", "p1", "en", 0, null))).isFalse()
        assertThat(base.isReady(ImaginePaintKey("f", "p1", "fr", 1, null))).isFalse()
        assertThat(base.isReady(ImaginePaintKey("f", "p1", "fr", 0, ImagineClip(5.0, 6.0)))).isFalse()
        assertThat(base.isReady(null)).isFalse()
        assertThat(base.value).isEqualTo("f|p1|fr|0||")
    }
}
