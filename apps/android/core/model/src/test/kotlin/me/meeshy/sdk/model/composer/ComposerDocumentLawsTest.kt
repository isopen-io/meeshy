package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

class ComposerDocumentLawsTest {
    private fun draft(
        format: ComposerFormat = ComposerFormat.POST,
        text: String? = "bonjour",
        visibility: StoryVisibility = StoryVisibility.PUBLIC,
        users: List<String>? = null,
        repost: String? = null,
        media: List<ComposerDocumentMedia> = emptyList(),
        location: Boolean = false,
    ) = ComposerDocumentDraft(format, text, visibility, users, repost, media, location)

    private fun image() = ComposerDocumentMedia("/a.jpg", "image/jpeg")

    @Test
    fun `every tool of the served row has a declared effect and none is greyed`() {
        val row = ComposerDocumentToolRow.servedRow(ComposerFormat.POST)
        assertThat(row).isEqualTo(ComposerDocumentTool.canonicalRow.filter { it.effect != null })
        assertThat(row.all { it.effect != null }).isTrue()
    }

    @Test
    fun `a status has no text-scene tool and a story has no document row`() {
        assertThat(ComposerDocumentToolRow.servedRow(ComposerFormat.STATUS)).doesNotContain(ComposerDocumentTool.TEXT_SCENE)
        assertThat(ComposerDocumentToolRow.servedRow(ComposerFormat.STORY)).isEmpty()
    }

    @Test
    fun `the palette anchors on the text scene, else on the emoji`() {
        assertThat(ComposerDocumentToolRow.paletteAnchor(ComposerDocumentToolRow.servedRow(ComposerFormat.POST)))
            .isEqualTo(ComposerDocumentTool.TEXT_SCENE)
        assertThat(ComposerDocumentToolRow.paletteAnchor(ComposerDocumentToolRow.servedRow(ComposerFormat.STATUS)))
            .isEqualTo(ComposerDocumentTool.EMOJI)
    }

    @Test
    fun `at 360 dp the nine tools tighten to their floor then scroll`() {
        val count = ComposerDocumentToolRow.servedRow(ComposerFormat.POST).size
        val fit = ComposerDocumentToolRow.fit(count, 360f)
        assertThat(fit.spacingDp).isEqualTo(ComposerDocumentToolRow.MINIMUM_SPACING_DP)
        assertThat(fit.scrolls).isTrue()
    }

    @Test
    fun `a scrolling row shows the start of its last tile once the field is wide enough`() {
        val fit = ComposerDocumentToolRow.fit(9, 402f)
        assertThat(fit.scrolls).isTrue()
        assertThat(fit.lastTilePeeks).isTrue()
        assertThat(ComposerDocumentToolRow.fit(9, 300f).scrolls).isTrue()
    }

    @Test
    fun `an unknown width keeps the nominal gap and does not claim to scroll`() {
        val fit = ComposerDocumentToolRow.fit(8, 0f)
        assertThat(fit.spacingDp).isEqualTo(ComposerDocumentToolRow.NOMINAL_SPACING_DP)
        assertThat(fit.scrolls).isFalse()
    }

    @Test
    fun `the document takes ten media at most`() {
        assertThat(ComposerDocumentRules.MAX_MEDIA).isEqualTo(10)
        assertThat(ComposerDocumentRules.freeMediaSlots(4)).isEqualTo(6)
        assertThat(ComposerDocumentRules.freeMediaSlots(12)).isEqualTo(0)
    }

    @Test
    fun `ONLY and EXCEPT need a named person, other audiences do not`() {
        assertThat(ComposerDocumentRules.audienceIsComplete(StoryVisibility.ONLY, emptyList())).isFalse()
        assertThat(ComposerDocumentRules.audienceIsComplete(StoryVisibility.EXCEPT, listOf("u1"))).isTrue()
        assertThat(ComposerDocumentRules.audienceIsComplete(StoryVisibility.FRIENDS, emptyList())).isTrue()
    }

    @Test
    fun `a photo without a word and a place alone are publishable, an empty draft is not`() {
        fun can(text: String = "", media: Boolean = false, place: Boolean = false, publishing: Boolean = false) =
            ComposerDocumentRules.canPublish(text, StoryVisibility.PUBLIC, emptyList(), publishing, null, media, place)
        assertThat(can(media = true)).isTrue()
        assertThat(can(place = true)).isTrue()
        assertThat(can(text = "  ")).isFalse()
        assertThat(can(text = "x", publishing = true)).isFalse()
    }

    @Test
    fun `publish is blocked while an ONLY audience is empty`() {
        assertThat(ComposerDocumentRules.canPublish("x", StoryVisibility.ONLY, emptyList(), false, null)).isFalse()
    }

    @Test
    fun `text only and media go by durable paths, a quote is refused as non durable`() {
        assertThat(ComposerDocumentSendPlan.plan(draft())).isEqualTo(ComposerDocumentSendPlan.Send(ComposerDocumentSendPath.TEXT_ONLY))
        assertThat(ComposerDocumentSendPlan.plan(draft(media = listOf(image()))))
            .isEqualTo(ComposerDocumentSendPlan.Send(ComposerDocumentSendPath.DURABLE_OUTBOX))
        assertThat(ComposerDocumentSendPlan.plan(draft(repost = "p1")))
            .isEqualTo(ComposerDocumentSendPlan.Refuse(ComposerDocumentSendRefusal.NonDurablePath(ComposerDocumentSendPath.QUOTED_REPOST)))
    }

    @Test
    fun `refusals are named`() {
        fun refusal(d: ComposerDocumentDraft) = (ComposerDocumentSendPlan.plan(d) as ComposerDocumentSendPlan.Refuse).refusal
        assertThat(refusal(draft(format = ComposerFormat.STORY))).isEqualTo(ComposerDocumentSendRefusal.WrongFormat(ComposerFormat.STORY))
        assertThat(refusal(draft(text = " "))).isEqualTo(ComposerDocumentSendRefusal.EmptyDraft)
        assertThat(refusal(draft(visibility = StoryVisibility.ONLY, users = emptyList())))
            .isEqualTo(ComposerDocumentSendRefusal.IncompleteAudience(StoryVisibility.ONLY))
        assertThat(refusal(draft(format = ComposerFormat.REEL, media = listOf(image()))))
            .isEqualTo(ComposerDocumentSendRefusal.ReelWithoutQualifyingMedia)
    }

    @Test
    fun `a reel with a long enough video is sent`() {
        val video = ComposerDocumentMedia("/v.mp4", "video/mp4", 5_000)
        assertThat(ComposerDocumentSendPlan.plan(draft(format = ComposerFormat.REEL, media = listOf(video))))
            .isInstanceOf(ComposerDocumentSendPlan.Send::class.java)
    }

    @Test
    fun `the publisher outcome names its refusal`() {
        assertThat(ComposerDocumentSendPlan.reported(true, null)).isNull()
        assertThat(ComposerDocumentSendPlan.reported(false, null)).isEqualTo(ComposerDocumentSendRefusal.PublisherSilent)
        assertThat(ComposerDocumentSendPlan.reported(true, "boom")).isEqualTo(ComposerDocumentSendRefusal.PublisherRejected("boom"))
    }
}
