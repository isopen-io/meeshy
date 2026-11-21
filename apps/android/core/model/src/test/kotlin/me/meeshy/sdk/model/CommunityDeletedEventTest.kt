package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * La disparition d'une communauté (#19592) : la charge de
 * `services/gateway/src/services/community-deleted-broadcast.ts`, lue et appliquée à la liste que
 * l'appareil tient — mêmes règles que le web (`community-deleted-live.ts`).
 */
class CommunityDeletedEventTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun community(id: String) = ApiCommunity(id = id, name = "Com $id")

    @Test
    fun `la charge community deleted se decode cle par cle`() {
        val decoded = json.decodeFromString(
            CommunityDeletedEvent.serializer(),
            """{"communityId":"c1","reason":"deactivated","at":"2026-11-18T08:00:00.000Z"}""",
        )

        assertThat(decoded.communityId).isEqualTo("c1")
        assertThat(decoded.reason).isEqualTo("deactivated")
        assertThat(decoded.at).isEqualTo("2026-11-18T08:00:00.000Z")
        assertThat(decoded.disappearedId).isEqualTo("c1")
    }

    @Test
    fun `une charge sans communaute ne designe rien`() {
        val decoded = json.decodeFromString(CommunityDeletedEvent.serializer(), """{"communityId":"","reason":"deleted"}""")

        assertThat(decoded.disappearedId).isNull()
    }

    @Test
    fun `la communaute disparue sort de la page tenue, les autres restent dans leur ordre`() {
        val page = listOf(community("a"), community("c1"), community("b"))

        assertThat(page.withoutCommunity("c1")?.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une page qui ne la tient pas n est pas reecrite`() {
        assertThat(listOf(community("a")).withoutCommunity("c1")).isNull()
    }
}
