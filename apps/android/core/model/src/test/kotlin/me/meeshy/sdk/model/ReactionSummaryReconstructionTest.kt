package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReactionSummaryReconstructionTest {

    @Test
    fun `un resume absent ne donne aucune reaction`() {
        assertThat(ReactionSummaryReconstruction.reconstruct(null, null)).isEmpty()
    }

    @Test
    fun `les emojis que j'ai poses sont marques`() {
        val result = ReactionSummaryReconstruction.reconstruct(mapOf("👍" to 3, "❤️" to 1), listOf("❤️"))
        assertThat(result).containsExactly(
            ReconstructedReaction("👍", 3, false),
            ReconstructedReaction("❤️", 1, true),
        ).inOrder()
    }

    @Test
    fun `un compte negatif ou nul est ecarte`() {
        val result = ReactionSummaryReconstruction.reconstruct(mapOf("👍" to -2, "🔥" to 0), null)
        assertThat(result).isEmpty()
    }

    @Test
    fun `un compte demesure est borne`() {
        val result = ReactionSummaryReconstruction.reconstruct(mapOf("👍" to Int.MAX_VALUE), null)
        assertThat(result.single().count).isEqualTo(ReactionSummaryReconstruction.MAX_COUNT)
    }
}
