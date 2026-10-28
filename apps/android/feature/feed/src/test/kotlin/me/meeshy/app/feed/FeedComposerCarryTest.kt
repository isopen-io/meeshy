package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry
import me.meeshy.sdk.model.composer.ComposerMediaTransfer
import org.junit.Test

class FeedComposerCarryTest {
    private fun media(id: String) = UploadedMedia(id, "u/$id", "image/jpeg", 1L, null, null, null, null)

    private fun carry(
        add: List<CarriedMedia> = emptyList(),
        remove: Set<String> = emptySet(),
        alts: Map<String, String> = emptyMap(),
        audience: StoryVisibility? = null,
    ) = ComposerCarry(
        ComposerCarry.Side.POST,
        ComposerMediaTransfer.plan(add, targetIds = emptyList(), ledger = emptySet(), room = 10).copy(remove = remove, alts = alts),
        audience,
        token = 1,
    )

    @Test
    fun `scene media become post media with their alt, by server id`() {
        val draft = FeedComposerDraft(text = "x").withCarry(carry(add = listOf(CarriedMedia(media("a"), "chat"), CarriedMedia(media("b"))), alts = mapOf("a" to "chat"))).draft
        assertThat(draft.mediaIds).containsExactly("a", "b").inOrder()
        assertThat(draft.mediaAlt).containsExactly("a", "chat")
        assertThat(draft.text).isEqualTo("x")
    }

    @Test
    fun `a carried caption becomes the caption of its post media and the post hands it back`() {
        val incoming = ComposerCarry(
            ComposerCarry.Side.POST,
            ComposerMediaTransfer.plan(listOf(CarriedMedia(media("a"), alt = "chat", caption = "Au marché")), emptyList(), emptySet(), room = 10),
            audience = null,
            token = 1,
        )
        val draft = FeedComposerDraft(text = "le post").withCarry(incoming).draft
        assertThat(draft.mediaCaption).containsExactly("a", "Au marché")
        assertThat(draft.mediaAlt).containsExactly("a", "chat")
        assertThat(draft.text).isEqualTo("le post")
        assertThat(draft.carriedMedia().single()).isEqualTo(CarriedMedia(media("a"), alt = "chat", caption = "Au marché"))
    }

    @Test
    fun `a media removed on the scene leaves the post and takes its alt along`() {
        val base = FeedComposerDraft().withMedia(listOf(media("a"), media("own"))).withAlt("a", "chat")
        val draft = base.withCarry(carry(remove = setOf("a"))).draft
        assertThat(draft.mediaIds).containsExactly("own")
        assertThat(draft.mediaAlt).isEmpty()
    }

    @Test
    fun `the audience follows only where a post can express it`() {
        assertThat(FeedComposerDraft().withCarry(carry(audience = StoryVisibility.FRIENDS)).draft.visibility).isEqualTo(FeedPostVisibility.FRIENDS)
        assertThat(FeedComposerDraft().withCarry(carry(audience = StoryVisibility.ONLY)).draft.visibility).isEqualTo(FeedPostVisibility.PUBLIC)
    }

    @Test
    fun `a restored draft fuller than the host knew keeps its media and counts the overflow, never twice`() {
        val restored = FeedComposerDraft().withMedia((1..9).map { media("own$it") })
        val result = restored.withCarry(carry(add = listOf(CarriedMedia(media("own1")), CarriedMedia(media("x")), CarriedMedia(media("y")))))
        assertThat(result.draft.mediaIds).hasSize(10)
        assertThat(result.draft.mediaIds.count { it == "own1" }).isEqualTo(1)
        assertThat(result.draft.mediaIds).contains("x")
        assertThat(result.lost).isEqualTo(1)
    }
}
