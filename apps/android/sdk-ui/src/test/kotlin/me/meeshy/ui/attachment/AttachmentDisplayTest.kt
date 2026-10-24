package me.meeshy.ui.attachment

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.AttachmentKind
import org.junit.Test

class AttachmentDisplayTest {
    @Test fun `chaque famille a une presentation distincte et sa teinte`() {
        val all = AttachmentKind.entries.map { AttachmentDisplay.of(it) }
        assertThat(all.map { it.hexTintColor }).containsAtLeast("4ECDC4", "FF6B6B", "9B59B6", "F39C12", "21803D", "2A56B5", "D96921", "6366F1", "808080")
        assertThat(all.map { it.shortLabel }.toSet()).hasSize(AttachmentKind.entries.size)
    }

    @Test fun `depuis un MIME`() {
        assertThat(AttachmentDisplay.ofMime("application/pdf").kind).isEqualTo(AttachmentKind.PDF)
        assertThat(AttachmentDisplay.ofMime(null).kind).isEqualTo(AttachmentKind.OTHER)
    }
}
