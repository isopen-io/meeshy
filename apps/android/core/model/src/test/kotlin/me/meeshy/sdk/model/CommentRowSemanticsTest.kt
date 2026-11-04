package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentRowSemanticsTest {

    @Test
    fun `body label puts time then content`() {
        assertThat(CommentRowSemantics.bodyLabel(format = "%1\$s : %2\$s", time = "2 min", content = "Salut"))
            .isEqualTo("2 min : Salut")
    }

    @Test
    fun `a veiled body speaks the veil label instead of its content`() {
        assertThat(CommentRowSemantics.spokenContent("secret", isVeiled = true, veiledLabel = "Masqué")).isEqualTo("Masqué")
        assertThat(CommentRowSemantics.spokenContent("secret", isVeiled = false, veiledLabel = "Masqué")).isEqualTo("secret")
    }

    @Test
    fun `reply value carries the count only when there are replies`() {
        assertThat(CommentRowSemantics.replyValue(0, "%d réponses")).isEmpty()
        assertThat(CommentRowSemantics.replyValue(3, "%d réponses")).isEqualTo("3 réponses")
    }

    @Test
    fun `like state description reflects liked and count`() {
        assertThat(CommentRowSemantics.likeStateDescription(isLiked = true, count = 2, likedLabel = "Aimé", countFormat = "%d")).isEqualTo("Aimé, 2")
        assertThat(CommentRowSemantics.likeStateDescription(isLiked = false, count = 0, likedLabel = "Aimé", countFormat = "%d")).isEmpty()
        assertThat(CommentRowSemantics.likeStateDescription(isLiked = false, count = 4, likedLabel = "Aimé", countFormat = "%d")).isEqualTo("4")
    }
}
