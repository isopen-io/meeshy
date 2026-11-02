package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class ContentRemovalRequestTest {

    private val json = Json { explicitNulls = false }

    @Test
    fun `un motif donne un corps reason`() {
        val body = ContentRemovalRequest.forReason("  spam  ")!!

        assertThat(json.encodeToString(body)).isEqualTo("""{"reason":"spam"}""")
    }

    @Test
    fun `sans motif aucun corps ne part, donc la requete reste celle d avant`() {
        assertThat(ContentRemovalRequest.forReason(null)).isNull()
        assertThat(ContentRemovalRequest.forReason("")).isNull()
        assertThat(ContentRemovalRequest.forReason("   ")).isNull()
    }
}
