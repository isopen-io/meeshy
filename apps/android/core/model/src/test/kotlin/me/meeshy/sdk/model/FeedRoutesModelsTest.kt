package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class FeedRoutesModelsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `le recu de partage sans lien suivi lit un compteur seul`() {
        val result = json.decodeFromString<PostShareResult>("""{"shared":true,"shareCount":4,"extra":1}""")

        assertThat(result.shareCount).isEqualTo(4)
        assertThat(result.shortUrl).isNull()
    }

    @Test
    fun `le recu de partage porte l url courte et le jeton`() {
        val result = json.decodeFromString<PostShareResult>(
            """{"shared":true,"shareCount":1,"shortUrl":"https://meeshy.me/l/abc","token":"abc"}""",
        )

        assertThat(result.shortUrl).isEqualTo("https://meeshy.me/l/abc")
        assertThat(result.token).isEqualTo("abc")
    }

    @Test
    fun `la moderation n est appliquee que pour updated ou unchanged`() {
        val receipt = PublicationModerationReceipt(
            action = "make-private",
            results = listOf(
                PublicationModerationReceipt.Result("a", "updated"),
                PublicationModerationReceipt.Result("b", "unchanged"),
                PublicationModerationReceipt.Result("c", "outranked"),
            ),
        )

        assertThat(receipt.isApplied("a")).isTrue()
        assertThat(receipt.isApplied("b")).isTrue()
        assertThat(receipt.isApplied("c")).isFalse()
        assertThat(receipt.isApplied("absent")).isFalse()
    }

    @Test
    fun `les trois pas de grille sont ceux de la passerelle`() {
        assertThat(NearbyDensityCellSize.entries.map { it.kilometers }).containsExactly(1.0, 10.0, 100.0).inOrder()
    }
}
