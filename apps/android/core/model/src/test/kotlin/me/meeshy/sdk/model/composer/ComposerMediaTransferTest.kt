package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

class ComposerMediaTransferTest {
    private fun carried(id: String, alt: String? = null) =
        CarriedMedia(UploadedMedia(id, "u/$id", "image/jpeg", 1L, null, null, null, null), alt)

    @Test
    fun `a media already on the arrival is not added twice and its description follows`() {
        val plan = ComposerMediaTransfer.plan(listOf(carried("a", "chat")), targetIds = listOf("a"), ledger = emptySet(), room = 5)
        assertThat(plan.add).isEmpty()
        assertThat(plan.alts).containsExactly("a", "chat")
        assertThat(plan.synced).containsExactly("a")
    }

    @Test
    fun `a blank description never travels and a duplicate source id counts once`() {
        val plan = ComposerMediaTransfer.plan(listOf(carried("a", " "), carried("a")), emptyList(), emptySet(), room = 5)
        assertThat(plan.add).hasSize(1)
        assertThat(plan.alts).isEmpty()
    }

    @Test
    fun `removals free room for the media that replace them`() {
        val plan = ComposerMediaTransfer.plan(listOf(carried("n")), targetIds = listOf("old"), ledger = setOf("old"), room = 0)
        assertThat(plan.remove).containsExactly("old")
        assertThat(plan.add.map { it.media.id }).containsExactly("n")
        assertThat(plan.leftBehind).isEqualTo(0)
    }

    @Test
    fun `a post expresses public friends and private only`() {
        assertThat(ComposerAudienceCarry.postWire(StoryVisibility.FRIENDS)).isEqualTo("FRIENDS")
        assertThat(ComposerAudienceCarry.postWire(StoryVisibility.COMMUNITY)).isNull()
        assertThat(ComposerAudienceCarry.fromPostWire("PRIVATE")).isEqualTo(StoryVisibility.PRIVATE)
        assertThat(ComposerAudienceCarry.fromPostWire("X")).isNull()
    }
}
