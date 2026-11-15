package me.meeshy.sdk.model.comments

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentReplyFocusTest {
    @Test fun `la cible est l'ancre comment-id pour une racine comme pour une réponse dépliée`() {
        assertThat(CommentReplyFocus.scrollTarget("65f0")).isEqualTo("comment-65f0")
    }

    @Test fun `la réponse qui se referme ne défile pas`() {
        assertThat(CommentReplyFocus.scrollTarget(null)).isNull()
        assertThat(CommentReplyFocus.scrollTarget("")).isNull()
    }

    @Test fun `le défilement attend 0,3 s que le clavier se pose`() {
        assertThat(CommentReplyFocus.KEYBOARD_SETTLE_MILLIS).isEqualTo(300L)
    }
}
