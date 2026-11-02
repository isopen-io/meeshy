package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerDocumentToolTest {

    @Test
    fun `the row follows the iOS order - photo, camera, file, place, microphone - whatever order the site serves`() {
        val served = setOf(
            ComposerDocumentTool.MICROPHONE, ComposerDocumentTool.PLACE, ComposerDocumentTool.DOCUMENT,
            ComposerDocumentTool.VIDEO, ComposerDocumentTool.CAMERA, ComposerDocumentTool.PHOTO,
        )
        assertThat(ComposerDocumentTool.servedRow(served)).containsExactly(
            ComposerDocumentTool.PHOTO, ComposerDocumentTool.CAMERA, ComposerDocumentTool.VIDEO,
            ComposerDocumentTool.DOCUMENT, ComposerDocumentTool.PLACE, ComposerDocumentTool.MICROPHONE,
        ).inOrder()
    }

    @Test
    fun `a tool the site does not serve is absent from the row`() {
        val row = ComposerDocumentTool.servedRow(setOf(ComposerDocumentTool.PHOTO, ComposerDocumentTool.PLACE))
        assertThat(row).containsExactly(ComposerDocumentTool.PHOTO, ComposerDocumentTool.PLACE).inOrder()
        assertThat(row).containsNoneOf(ComposerDocumentTool.EMOJI, ComposerDocumentTool.MENTION)
    }

    @Test
    fun `the photo library, the camera and the file are three tools of the document, not one media door`() {
        val row = ComposerDocumentTool.canonicalRow
        assertThat(row).containsAtLeast(ComposerDocumentTool.PHOTO, ComposerDocumentTool.CAMERA, ComposerDocumentTool.DOCUMENT)
    }

    @Test
    fun `only the tools that attach a file need a free media slot - the place qualifies the text`() {
        assertThat(ComposerDocumentTool.PLACE.consumesMediaSlot).isFalse()
        assertThat(ComposerDocumentTool.MENTION.consumesMediaSlot).isFalse()
        listOf(
            ComposerDocumentTool.PHOTO, ComposerDocumentTool.CAMERA, ComposerDocumentTool.VIDEO,
            ComposerDocumentTool.DOCUMENT, ComposerDocumentTool.MICROPHONE,
        ).forEach { assertThat(it.consumesMediaSlot).isTrue() }
    }
}
