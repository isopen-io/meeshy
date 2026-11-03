package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostReactionSummaryLawTest {

    @Test
    fun `le compte absolu remplace celui de l'emoji sans toucher aux autres`() {
        val post = ApiPost(id = "p", reactionSummary = mapOf("🔥" to 2, "❤️" to 5))

        assertThat(PostReactionSummaryLaw.applying(post, "🔥", 3)!!.reactionSummary).containsExactly("🔥", 3, "❤️", 5)
    }

    @Test
    fun `un emoji tombe a zero disparait du resume`() {
        val post = ApiPost(id = "p", reactionSummary = mapOf("🔥" to 1))

        assertThat(PostReactionSummaryLaw.applying(post, "🔥", 0)!!.reactionSummary).isEmpty()
    }

    @Test
    fun `un compte deja a jour ne change rien`() {
        assertThat(PostReactionSummaryLaw.applying(ApiPost(id = "p", reactionSummary = mapOf("🔥" to 2)), "🔥", 2)).isNull()
    }
}
