package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * Behavioural spec for the pure feed-post composer draft — the Android SSOT for
 * the Feed composer (port of iOS `FeedView.composerOverlay`'s `composerText` +
 * `postVisibility` + `pendingAttachments` + `composerForcePlainPost`). It owns
 * the publish gate, the body actually sent, the visibility transition, the
 * attached-media accumulation and the reel-classification decision
 * ([ReelComposition]), so the Composable stays glue and every rule is fully
 * unit-tested.
 */
class FeedComposerDraftTest {

    private fun media(id: String, mimeType: String = "image/jpeg", durationMs: Long? = null) = UploadedMedia(
        id = id,
        url = "https://cdn.meeshy.me/$id",
        mimeType = mimeType,
        fileSize = 10,
        width = null,
        height = null,
        durationMs = durationMs,
        thumbnailUrl = null,
    )

    // --- publish gate -----------------------------------------------------

    @Test
    fun `a fresh draft has empty text and cannot be published`() {
        val draft = FeedComposerDraft()

        assertThat(draft.text).isEmpty()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `typing non-blank text enables publishing`() {
        val draft = FeedComposerDraft().withText("hello world")

        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `whitespace-only text cannot publish`() {
        val draft = FeedComposerDraft().withText("   \n\t  ")

        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `clearing the text back to empty disables publishing again`() {
        val draft = FeedComposerDraft().withText("hello").withText("")

        assertThat(draft.canPublish).isFalse()
    }

    // --- body actually sent -------------------------------------------------

    @Test
    fun `trimmedContent strips surrounding whitespace`() {
        val draft = FeedComposerDraft().withText("  hello world  ")

        assertThat(draft.trimmedContent).isEqualTo("hello world")
    }

    @Test
    fun `trimmedContent is empty for blank or empty text`() {
        assertThat(FeedComposerDraft().withText("   ").trimmedContent).isEmpty()
        assertThat(FeedComposerDraft().withText("").trimmedContent).isEmpty()
    }

    // --- visibility -----------------------------------------------------------

    @Test
    fun `a fresh draft defaults to public visibility`() {
        assertThat(FeedComposerDraft().visibility).isEqualTo(FeedPostVisibility.PUBLIC)
    }

    @Test
    fun `changing visibility carries the wire value the gateway expects`() {
        val draft = FeedComposerDraft().withVisibility(FeedPostVisibility.FRIENDS)

        assertThat(draft.visibility).isEqualTo(FeedPostVisibility.FRIENDS)
        assertThat(draft.visibility.wire).isEqualTo("FRIENDS")
    }

    @Test
    fun `every visibility case carries the exact wire string the gateway expects`() {
        assertThat(FeedPostVisibility.PUBLIC.wire).isEqualTo("PUBLIC")
        assertThat(FeedPostVisibility.FRIENDS.wire).isEqualTo("FRIENDS")
        assertThat(FeedPostVisibility.PRIVATE.wire).isEqualTo("PRIVATE")
    }

    // --- publish request --------------------------------------------------

    @Test
    fun `a blank draft yields no publish request`() {
        assertThat(FeedComposerDraft().publishRequest()).isNull()
        assertThat(FeedComposerDraft().withText("   ").publishRequest()).isNull()
    }

    @Test
    fun `a non-blank draft yields a publish request carrying the trimmed body and wire visibility`() {
        val request = FeedComposerDraft()
            .withText("  hello world  ")
            .withVisibility(FeedPostVisibility.PRIVATE)
            .publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEqualTo("hello world")
        assertThat(request.visibility).isEqualTo("PRIVATE")
    }

    @Test
    fun `a publish request always defaults to public when the visibility was never changed`() {
        val request = FeedComposerDraft().withText("hi").publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.visibility).isEqualTo("PUBLIC")
    }

    @Test
    fun `a text-only publish request carries the POST type`() {
        val request = FeedComposerDraft().withText("hi").publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.type).isEqualTo("POST")
    }

    // --- media attachments -------------------------------------------------

    @Test
    fun `a fresh draft has no media and the full allowance remaining`() {
        val draft = FeedComposerDraft()

        assertThat(draft.mediaIds).isEmpty()
        assertThat(draft.remainingMediaSlots).isEqualTo(FeedComposerDraft.MAX_MEDIA)
        assertThat(draft.isMediaFull).isFalse()
    }

    @Test
    fun `withMedia appends uploaded items and enables publishing even with blank text`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1"), media("m2")))

        assertThat(draft.mediaIds).containsExactly("m1", "m2").inOrder()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `withMedia accumulates across multiple picks`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1"))).withMedia(listOf(media("m2"), media("m3")))

        assertThat(draft.mediaIds).containsExactly("m1", "m2", "m3").inOrder()
    }

    @Test
    fun `withMedia caps the total at the MAX_MEDIA allowance`() {
        val eight = List(8) { media("existing$it") }
        val draft = FeedComposerDraft(media = eight).withMedia(
            listOf(media("n1"), media("n2"), media("n3"), media("n4"), media("n5")),
        )

        assertThat(draft.mediaIds).hasSize(FeedComposerDraft.MAX_MEDIA)
        assertThat(draft.mediaIds).containsExactlyElementsIn(eight.map { it.id } + listOf("n1", "n2")).inOrder()
    }

    @Test
    fun `withoutMedia removes exactly the matching id`() {
        val draft = FeedComposerDraft(media = listOf(media("m1"), media("m2"), media("m3"))).withoutMedia("m2")

        assertThat(draft.mediaIds).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `withoutMedia on an unknown id is inert`() {
        val draft = FeedComposerDraft(media = listOf(media("m1")))

        assertThat(draft.withoutMedia("does-not-exist").mediaIds).containsExactly("m1")
    }

    @Test
    fun `removing the last media disables publishing again when text is also blank`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1"))).withoutMedia("m1")

        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `remainingMediaSlots counts down and isMediaFull flips at the cap`() {
        val almostFull = FeedComposerDraft(media = List(FeedComposerDraft.MAX_MEDIA - 1) { media("m$it") })
        assertThat(almostFull.remainingMediaSlots).isEqualTo(1)
        assertThat(almostFull.isMediaFull).isFalse()

        val full = FeedComposerDraft(media = List(FeedComposerDraft.MAX_MEDIA) { media("m$it") })
        assertThat(full.remainingMediaSlots).isEqualTo(0)
        assertThat(full.isMediaFull).isTrue()
    }

    @Test
    fun `blank text with attached media still yields a publish request carrying the media ids`() {
        val request = FeedComposerDraft().withMedia(listOf(media("m1"), media("m2"))).publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEmpty()
        assertThat(request.mediaIds).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `a text-only publish request carries no media ids`() {
        val request = FeedComposerDraft().withText("hello").publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.mediaIds).isEmpty()
    }

    @Test
    fun `a publish request with both text and media carries both`() {
        val request = FeedComposerDraft().withText("hello").withMedia(listOf(media("m1"))).publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEqualTo("hello")
        assertThat(request.mediaIds).containsExactly("m1")
    }

    // --- reel classification (ReelComposition) ------------------------------

    @Test
    fun `a fresh draft does not qualify as a reel and publishes as POST`() {
        val draft = FeedComposerDraft()

        assertThat(draft.qualifiesAsReel).isFalse()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `a single image never qualifies as a reel`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1", mimeType = "image/jpeg")))

        assertThat(draft.qualifiesAsReel).isFalse()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `at least two images qualifies as a reel by default`() {
        val draft = FeedComposerDraft().withMedia(
            listOf(media("m1", mimeType = "image/jpeg"), media("m2", mimeType = "image/png")),
        )

        assertThat(draft.qualifiesAsReel).isTrue()
        assertThat(draft.postType).isEqualTo(PostType.REEL)
    }

    @Test
    fun `a qualifying video (duration at or above the 3s floor) defaults to REEL`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1", mimeType = "video/mp4", durationMs = 3000)))

        assertThat(draft.qualifiesAsReel).isTrue()
        assertThat(draft.postType).isEqualTo(PostType.REEL)
    }

    @Test
    fun `a short video (under the 3s floor) does not qualify and defaults to POST`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1", mimeType = "video/mp4", durationMs = 2999)))

        assertThat(draft.qualifiesAsReel).isFalse()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `a video with unknown duration does not qualify — never a permissive fallback`() {
        val draft = FeedComposerDraft().withMedia(listOf(media("m1", mimeType = "video/mp4", durationMs = null)))

        assertThat(draft.qualifiesAsReel).isFalse()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `forcePlainPost overrides a qualifying composition back to POST without hiding qualification`() {
        val draft = FeedComposerDraft()
            .withMedia(listOf(media("m1", mimeType = "image/jpeg"), media("m2", mimeType = "image/png")))
            .withForcePlainPost(true)

        assertThat(draft.qualifiesAsReel).isTrue()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `forcePlainPost on a non-qualifying composition is inert`() {
        val draft = FeedComposerDraft()
            .withMedia(listOf(media("m1", mimeType = "image/jpeg")))
            .withForcePlainPost(true)

        assertThat(draft.qualifiesAsReel).isFalse()
        assertThat(draft.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `removing an image down to one de-qualifies a previously-qualifying draft`() {
        val draft = FeedComposerDraft()
            .withMedia(listOf(media("m1", mimeType = "image/jpeg"), media("m2", mimeType = "image/png")))
        assertThat(draft.qualifiesAsReel).isTrue()

        val afterRemoval = draft.withoutMedia("m2")

        assertThat(afterRemoval.qualifiesAsReel).isFalse()
        assertThat(afterRemoval.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `a qualifying reel publish request carries the REEL type`() {
        val request = FeedComposerDraft()
            .withText("check this out")
            .withMedia(listOf(media("m1", mimeType = "video/mp4", durationMs = 5000)))
            .publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.type).isEqualTo("REEL")
    }

    @Test
    fun `a forced-plain-post publish request carries the POST type despite qualifying media`() {
        val request = FeedComposerDraft()
            .withMedia(listOf(media("m1", mimeType = "image/jpeg"), media("m2", mimeType = "image/png")))
            .withForcePlainPost(true)
            .publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.type).isEqualTo("POST")
    }
}
