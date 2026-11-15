package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecentMediaAttachmentLinkTest {

    @Test
    fun `attached asset ids follow the zone order and ignore dead attachments and duplicates`() {
        val links = mapOf("p1" to "A", "p2" to "B", "p3" to "A", "gone" to "Z")
        val ids = RecentMediaAttachmentLink.attachedAssetIds(links, liveAttachmentIds = listOf("p2", "p1", "p3", "unlinked"))
        assertThat(ids).containsExactly("B", "A").inOrder()
    }

    @Test
    fun `linking adds the new link and prunes the ones whose attachment is gone`() {
        val links = mapOf("p1" to "A", "dead" to "B")
        val next = RecentMediaAttachmentLink.linking("C", attachmentId = "p2", links = links, liveAttachmentIds = listOf("p1", "p2"))
        assertThat(next).containsExactly("p1", "A", "p2", "C")
    }

    @Test
    fun `fresh keeps order and drops attached assets and duplicates`() {
        val fresh = RecentMediaAttachmentLink.fresh(listOf("A", "B", "A", "C"), excluding = setOf("B"))
        assertThat(fresh).containsExactly("A", "C").inOrder()
    }

    @Test
    fun `ingestible indices always take an element without identifier and skip attached or repeated ones`() {
        val indices = RecentMediaAttachmentLink.ingestibleIndices(listOf("A", null, "B", "B", "C"), excluding = setOf("A"))
        assertThat(indices).containsExactly(1, 2, 4).inOrder()
    }

    @Test
    fun `picker preselection puts attached first then selection without duplicates capped by the limit`() {
        val pre = RecentMediaAttachmentLink.pickerPreselection(listOf("A", "B"), listOf("B", "C", "D"), limit = 3)
        assertThat(pre).containsExactly("A", "B", "C").inOrder()
        assertThat(RecentMediaAttachmentLink.pickerPreselection(listOf("A"), emptyList(), limit = -1)).isEmpty()
    }

    @Test
    fun `only attached assets that come back checked in the picker can be unchecked`() {
        val result = RecentMediaAttachmentLink.preselectedAttached(listOf("A", "B", "C"), preselection = listOf("A", "B", "X"))
        assertThat(result).containsExactly("A", "B").inOrder()
    }

    @Test
    fun `deselected attachment ids are those whose asset was primed and did not come back`() {
        val links = mapOf("p1" to "A", "p2" to "B")
        val removed = RecentMediaAttachmentLink.deselectedAttachmentIds(
            links, liveAttachmentIds = listOf("p1", "p2"), preselected = listOf("A", "B"), returned = listOf("A"),
        )
        assertThat(removed).containsExactly("p2")
    }

    @Test
    fun `an element returned without identifier or an empty preselection removes nothing`() {
        val links = mapOf("p1" to "A")
        assertThat(
            RecentMediaAttachmentLink.deselectedAttachmentIds(links, listOf("p1"), listOf("A"), listOf(null)),
        ).isEmpty()
        assertThat(
            RecentMediaAttachmentLink.deselectedAttachmentIds(links, listOf("p1"), emptyList(), listOf("B")),
        ).isEmpty()
    }
}
