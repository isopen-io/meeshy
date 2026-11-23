package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ResolvedTrackedLink
import org.junit.Test

/**
 * Ce que les vecteurs partagés ne disent pas : le chemin seul (la forme que la passerelle lit sur `originalUrl`),
 * l'adresse canonique, les quatre genres, et la cible d'un lien SUIVI une fois résolu (contrat #19331 § 1).
 */
class ContentLinkTargetTest {

    private val id = "66f0c0ffee0000000000c0de"

    @Test
    fun `the path alone reads the content it designates`() {
        assertThat(ContentLinkTarget.ofPath("/reel/$id")).isEqualTo(ContentLinkTarget.Content(id, PostType.REEL))
        assertThat(ContentLinkTarget.ofPath("/feeds/post/$id/")).isEqualTo(ContentLinkTarget.Content(id, null))
        assertThat(ContentLinkTarget.ofPath("/l/Ab3xYz")).isNull()
        assertThat(ContentLinkTarget.ofPath("/reel/$id/x")).isNull()
        assertThat(ContentLinkTarget.ofPath("/reel/$id//")).isNull()
        assertThat(ContentLinkTarget.ofPath("/REEL/$id")).isNull()
        assertThat(ContentLinkTarget.ofPath("/feeds/p/$id")).isNull()
        assertThat(ContentLinkTarget.ofPath("reel/$id")).isNull()
        assertThat(ContentLinkTarget.ofPath("")).isNull()
    }

    @Test
    fun `the canonical address of each kind reads back to the same content`() {
        assertThat(ContentLinkTarget.webUrl("https://meeshy.me", PostType.POST, id)).isEqualTo("https://meeshy.me/post/$id")
        assertThat(ContentLinkTarget.webUrl("https://meeshy.me/", PostType.STATUS, id)).isEqualTo("https://meeshy.me/mood/$id")
        PostType.entries.forEach { type ->
            assertThat(ContentLinkTarget.of(ContentLinkTarget.webUrl("https://meeshy.me", type, id)))
                .isEqualTo(ContentLinkTarget.Content(id, type))
        }
    }

    @Test
    fun `only the four exact kinds are content kinds`() {
        assertThat(PostType.entries.map { ContentLinkTarget.kindOf(it.name) }).containsExactlyElementsIn(PostType.entries)
        listOf("EXTERNAL", "CONVERSATION", "PROFILE", "post", " POST", "", null)
            .forEach { assertThat(ContentLinkTarget.kindOf(it)).isNull() }
    }

    @Test
    fun `the hosts are production, its www and staging, nothing else`() {
        assertThat(ContentLinkTarget.HOSTS).containsExactly("meeshy.me", "www.meeshy.me", "staging.meeshy.me")
        assertThat(ContentLinkTarget.of("https://app.meeshy.me/post/$id")).isNull()
    }

    @Test
    fun `the plain https address tolerates an empty user part and the default port, as the URL standard reads them`() {
        assertThat(ContentLinkTarget.of("https://meeshy.me:443/post/$id")).isEqualTo(ContentLinkTarget.Content(id, PostType.POST))
        assertThat(ContentLinkTarget.of("https://@meeshy.me/post/$id")).isEqualTo(ContentLinkTarget.Content(id, PostType.POST))
        assertThat(ContentLinkTarget.of("HTTPS://meeshy.me/post/$id")).isEqualTo(ContentLinkTarget.Content(id, PostType.POST))
        assertThat(ContentLinkTarget.of("https://u:p@meeshy.me/post/$id")).isNull()
        assertThat(ContentLinkTarget.of("https://meeshy.me:80/post/$id")).isNull()
    }

    private fun resolved(
        kind: String? = "tracking",
        targetType: String? = null,
        targetId: String? = null,
        originalUrl: String? = null,
    ) = ResolvedTrackedLink(kind = kind, targetType = targetType, targetId = targetId, originalUrl = originalUrl)

    @Test
    fun `a tracked link typed as content designates its target`() {
        PostType.entries.forEach { type ->
            assertThat(ContentLinkTarget.ofResolved(resolved(targetType = type.name, targetId = id)))
                .isEqualTo(ContentLinkTarget.Content(id, type))
        }
    }

    @Test
    fun `a typed target that is not an object id designates nothing`() {
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "POST", targetId = "x1"))).isNull()
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "POST", targetId = null))).isNull()
        assertThat(
            ContentLinkTarget.ofResolved(resolved(targetType = "POST", targetId = "x1", originalUrl = "https://meeshy.me/post/$id")),
        ).isNull()
    }

    @Test
    fun `an untyped or external tracked link is content only when its original address is a direct content address`() {
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "EXTERNAL", originalUrl = "https://meeshy.me/reel/$id")))
            .isEqualTo(ContentLinkTarget.Content(id, PostType.REEL))
        assertThat(ContentLinkTarget.ofResolved(resolved(originalUrl = "https://meeshy.me/p/$id")))
            .isEqualTo(ContentLinkTarget.Content(id, null))
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "EXTERNAL", originalUrl = "https://example.org/post/$id"))).isNull()
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "EXTERNAL", originalUrl = "https://meeshy.me/l/Other1"))).isNull()
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "EXTERNAL"))).isNull()
    }

    @Test
    fun `an invitation, a profile or an unknown kind of link is never content`() {
        assertThat(ContentLinkTarget.ofResolved(resolved(kind = "conversation", targetType = "POST", targetId = id))).isNull()
        assertThat(ContentLinkTarget.ofResolved(resolved(kind = null, targetType = "POST", targetId = id))).isNull()
        assertThat(ContentLinkTarget.ofResolved(resolved(targetType = "PROFILE", targetId = id))).isNull()
        assertThat(
            ContentLinkTarget.ofResolved(resolved(targetType = "CONVERSATION", targetId = id, originalUrl = "https://meeshy.me/post/$id")),
        ).isNull()
    }
}
