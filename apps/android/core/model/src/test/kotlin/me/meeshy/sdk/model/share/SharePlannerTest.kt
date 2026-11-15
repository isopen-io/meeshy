package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class SharePlannerTest {
    private val mb = 1024L * 1024L

    private fun image(id: String = "img") = ShareMedia(id = id, mimeType = "image/jpeg", bytes = 2 * mb)
    private fun video(id: String = "vid", durationMs: Int = 14_000) =
        ShareMedia(id = id, mimeType = "video/mp4", bytes = 20 * mb, durationMs = durationMs)
    private fun audio(id: String = "aud") = ShareMedia(id = id, mimeType = "audio/m4a", bytes = mb, durationMs = 30_000)
    private fun file(id: String = "doc") = ShareMedia(id = id, mimeType = "application/pdf", bytes = mb)
    private fun message(id: String = "m1", pieces: List<ShareMedia> = emptyList(), text: String? = "Bonjour",
                        flags: Long? = null, viewOnce: Boolean? = null, blurred: Boolean? = null,
                        duration: Double? = null, encrypted: Boolean = false, cites: Boolean = false) =
        ShareMessage(id = id, text = text, pieces = pieces, effectFlags = flags, isViewOnce = viewOnce,
            isBlurred = blurred, ephemeralDuration = duration, encrypted = encrypted, citesProtected = cites)

    private fun actions(entry: ShareEntry) = SharePlanner.plan(entry).actions.toSet()

    @Test
    fun `the entry by action matrix of the board`() {
        val rows: List<Triple<ShareEntry, Set<ShareAction>, String>> = listOf(
            Triple(ShareEntry.Text("Hello"), setOf(ShareAction.SEND, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO), "text"),
            Triple(ShareEntry.Link("https://a.org"), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.STUDIO, ShareAction.COPY_LINK, ShareAction.SHARE_OUT), "link"),
            Triple(ShareEntry.Media(listOf(image())), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.STUDIO), "1 image"),
            Triple(ShareEntry.Media(listOf(video())), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.PUBLISH_REEL, ShareAction.STUDIO), "1 video"),
            Triple(ShareEntry.Media(listOf(image("a"), image("b"), video("c"))), setOf(ShareAction.SEND, ShareAction.CAPTION,
                ShareAction.REORDER, ShareAction.GROUPING, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY,
                ShareAction.PUBLISH_REEL, ShareAction.STUDIO), "many"),
            Triple(ShareEntry.Media(listOf(audio())), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.STUDIO), "audio"),
            Triple(ShareEntry.Media(listOf(file())), setOf(ShareAction.SEND, ShareAction.CAPTION), "file"),
            Triple(ShareEntry.Media(listOf(file("a"), file("b"))), setOf(ShareAction.SEND, ShareAction.CAPTION,
                ShareAction.REORDER, ShareAction.GROUPING), "two files"),
            Triple(ShareEntry.Piece(message(pieces = listOf(image("p1"), image("p2"), image("p3"))), "p3"),
                setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY,
                    ShareAction.STUDIO, ShareAction.SAVE, ShareAction.SHARE_OUT), "piece"),
            Triple(ShareEntry.Messages(listOf(message(pieces = listOf(image("p1"))))),
                setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY,
                    ShareAction.STUDIO, ShareAction.SAVE, ShareAction.IMAGER, ShareAction.COPY_TEXT, ShareAction.SHARE_OUT), "message 1 photo"),
            Triple(ShareEntry.Messages(listOf(message())), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.IMAGER,
                ShareAction.COPY_TEXT), "text message"),
            Triple(ShareEntry.Messages(listOf(message("a"), message("b"))), setOf(ShareAction.SEND, ShareAction.CAPTION,
                ShareAction.REORDER, ShareAction.IMAGER, ShareAction.COPY_TEXT), "messages"),
            Triple(ShareEntry.Card(ShareCardKind.POST, "u"), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.COPY_LINK, ShareAction.SHARE_OUT), "post"),
            Triple(ShareEntry.Card(ShareCardKind.STORY, "u"), setOf(ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST,
                ShareAction.PUBLISH_STORY, ShareAction.PUBLISH_REEL, ShareAction.STUDIO, ShareAction.COPY_LINK, ShareAction.SHARE_OUT), "story"),
            Triple(ShareEntry.Card(ShareCardKind.PROFILE, "u"), setOf(ShareAction.SEND, ShareAction.CAPTION,
                ShareAction.COPY_LINK, ShareAction.SHARE_OUT), "profile"),
        )
        rows.forEach { (entry, expected, label) -> assertWithMessage(label).that(actions(entry)).isEqualTo(expected) }
    }

    @Test
    fun `a single photo is not a reel and the plan says why`() {
        val plan = SharePlanner.plan(ShareEntry.Media(listOf(image())))
        assertThat(plan.withheld).contains(ShareWithheld(ShareAction.PUBLISH_REEL, ShareWithheldReason.SINGLE_PHOTO_NOT_A_REEL))
        val files = SharePlanner.plan(ShareEntry.Media(listOf(file("a"), image("b"))))
        assertThat(files.actions).containsNoneOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY)
    }

    @Test
    fun `more than ten media withhold every publication`() {
        val plan = SharePlanner.plan(ShareEntry.Media((1..11).map { image("i$it") }))
        assertThat(plan.actions).containsNoneOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO)
        assertThat(plan.withheld.map { it.reason }).contains(ShareWithheldReason.TOO_MANY_FOR_PUBLICATION)
    }

    @Test
    fun `a view once message is withdrawn and blocks the forward`() {
        val plan = SharePlanner.plan(ShareEntry.Messages(listOf(message(viewOnce = true))))
        assertThat(plan.blocked).isEqualTo(ShareWithdrawReason.VIEW_ONCE)
        assertThat(plan.withdrawn).containsExactly(ShareWithdrawal("m1", ShareWithdrawReason.VIEW_ONCE))
        assertThat(SharePlanner.plan(ShareEntry.Messages(listOf(message(viewOnce = true))), listOf(ShareDestination("conv:1"))).canSend).isFalse()
    }

    @Test
    fun `a protected message among ordinary ones is dropped and the rest travels`() {
        val plan = SharePlanner.plan(ShareEntry.Messages(listOf(message("ok"), message("secret", viewOnce = true))))
        assertThat(plan.kept).containsExactly("ok")
        assertThat(plan.withdrawn.map { it.id }).containsExactly("secret")
        assertThat(plan.blocked).isNull()
    }

    @Test
    fun `an after read flame is refused and a timed flame keeps its bound and drops the exports`() {
        val afterRead = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ)
        assertThat(SharePlanner.plan(ShareEntry.Messages(listOf(message(flags = afterRead)))).blocked)
            .isEqualTo(ShareWithdrawReason.AFTER_READ)
        val timed = SharePlanner.plan(ShareEntry.Messages(listOf(message(flags = MessageEffectFlags.EPHEMERAL, duration = 60.0,
            pieces = listOf(image())))))
        assertThat(timed.flameMaxDurationSeconds).isEqualTo(60)
        assertThat(timed.actions).containsNoneOf(ShareAction.SAVE, ShareAction.IMAGER, ShareAction.PUBLISH_POST, ShareAction.SHARE_OUT)
        assertThat(timed.withheld.map { it.reason }).contains(ShareWithheldReason.FLAME)
        assertThat(timed.actions).contains(ShareAction.SEND)
    }

    @Test
    fun `a blurred message forwards blurred and exports nothing`() {
        val plan = SharePlanner.plan(ShareEntry.Messages(listOf(message(blurred = true, pieces = listOf(image())))))
        assertThat(plan.blurInherited).isTrue()
        assertThat(plan.actions).contains(ShareAction.SEND)
        assertThat(plan.actions).containsNoneOf(ShareAction.SAVE, ShareAction.PUBLISH_STORY, ShareAction.COPY_LINK)
    }

    @Test
    fun `an encrypted source copies on device warns the plain destinations and never publishes`() {
        val plan = SharePlanner.plan(
            ShareEntry.Messages(listOf(message(encrypted = true, pieces = listOf(image())))),
            listOf(ShareDestination("conv:plain"), ShareDestination("conv:sealed", encrypted = true)),
        )
        assertThat(plan.encryption).isEqualTo(ShareEncryption(warnDestinationIds = listOf("conv:plain")))
        assertThat(plan.actions).containsNoneOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO)
        assertThat(plan.withheld.map { it.reason }).contains(ShareWithheldReason.ENCRYPTED)
        assertThat(SharePlanner.plan(ShareEntry.Messages(listOf(message()))).encryption).isNull()
    }

    @Test
    fun `a message that quotes a protected content cannot be imaged`() {
        val plan = SharePlanner.plan(ShareEntry.Messages(listOf(message(cites = true))))
        assertThat(plan.actions).doesNotContain(ShareAction.IMAGER)
        assertThat(plan.withheld).contains(ShareWithheld(ShareAction.IMAGER, ShareWithheldReason.CITES_PROTECTED))
    }

    @Test
    fun `a missing piece blocks as unavailable`() {
        val plan = SharePlanner.plan(ShareEntry.Piece(message(pieces = listOf(image("p1"))), "nope"))
        assertThat(plan.blocked).isEqualTo(ShareWithdrawReason.UNAVAILABLE)
    }

    @Test
    fun `the limits trim from the end and cap the recipients`() {
        val big = (1..3).map { ShareMedia(id = "b$it", mimeType = "video/mp4", bytes = 2L * 1024 * mb, durationMs = 5000) }
        assertThat(SharePlanner.trimCount(big)).isEqualTo(1)
        val manyFiles = (1..101).map { file("f$it") }
        assertThat(SharePlanner.trimCount(manyFiles)).isEqualTo(1)
        val destinations = (1..11).map { ShareDestination("c$it") }
        val plan = SharePlanner.plan(ShareEntry.Text("hi"), destinations)
        assertThat(plan.limits.overRecipients).isEqualTo(1)
        assertThat(plan.canSend).isFalse()
        assertThat(SharePlanner.plan(ShareEntry.Text("hi"), destinations.take(10)).canSend).isTrue()
        assertThat(SharePlanner.plan(ShareEntry.Text("hi"), emptyList()).canSend).isFalse()
    }

    @Test
    fun `grouping and caption placement follow the entry`() {
        val media = SharePlanner.plan(ShareEntry.Media(listOf(image("a"), image("b"))))
        assertThat(media.grouping).isEqualTo(ShareGrouping.TOGETHER)
        assertThat(media.caption?.placement).isEqualTo(ShareCaption.Placement.MESSAGE_TEXT)
        val forward = SharePlanner.plan(ShareEntry.Messages(listOf(message())))
        assertThat(forward.title).isEqualTo(ShareTitle.FORWARD)
        assertThat(forward.caption?.placement).isEqualTo(ShareCaption.Placement.SEPARATE_MESSAGE)
        assertThat(SharePlanner.plan(ShareEntry.Text("x")).caption).isNull()
        assertThat(SharePlanner.plan(ShareEntry.Text("x")).title).isEqualTo(ShareTitle.SEND)
        assertThat(ContentExitLaw.Ordinary.forward.isAllowed).isTrue()
    }
}
