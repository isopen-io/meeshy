package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import me.meeshy.sdk.model.deeplink.DeepLinkParser
import org.junit.Test
import org.w3c.dom.Element

/**
 * Garde de cohérence : chaque chemin https que [DeepLinkParser] lit est revendiqué par un intent-filter du manifeste
 * (sinon le lien s'ouvre dans le navigateur au lieu de l'app), et aucun lien à jeton d'authentification n'est
 * revendiqué hors https.
 */
class ManifestDeepLinksGuardTest {

    private data class Filter(
        val verified: Boolean,
        val schemes: Set<String>,
        val hosts: Set<String>,
        val exact: Set<String>,
        val prefixes: Set<String>,
    ) {
        fun claims(scheme: String, host: String, path: String): Boolean =
            scheme in schemes && host in hosts && (path in exact || prefixes.any { path.startsWith(it) })
    }

    private val filters: List<Filter> by lazy {
        val manifest = listOf("src/main/AndroidManifest.xml", "app/src/main/AndroidManifest.xml").map(::File).first { it.exists() }
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(manifest)
        val nodes = document.getElementsByTagName("intent-filter")
        (0 until nodes.length).map { nodes.item(it) as Element }.map { filter ->
            val data = filter.getElementsByTagName("data").let { list -> (0 until list.length).map { list.item(it) as Element } }
            fun values(attribute: String) = data.map { it.getAttribute("android:$attribute") }.filter { it.isNotEmpty() }.toSet()
            Filter(
                verified = filter.getAttribute("android:autoVerify") == "true",
                schemes = values("scheme"),
                hosts = values("host"),
                exact = values("path"),
                prefixes = values("pathPrefix"),
            )
        }
    }

    private val hosts = listOf("meeshy.me", "www.meeshy.me")

    private val parserPaths = listOf(
        "/me", "/me/progression/saison/3", "/links", "/hashtag/paris", "/join/abc", "/l/AbC123", "/chat/abc", "/c/abc",
        "/conversation/abc", "/reel/r1", "/reels", "/community/k1", "/communities/k1", "/feeds/post/p1", "/post/p1",
        "/p/p1", "/story/s1", "/stories/s1", "/s/s1", "/u/bob", "/users/bob", "/signup", "/signup/affiliate/CODE",
    )

    @Test
    fun `every https path the parser reads is claimed by a verified app link on both hosts`() {
        val unclaimed = hosts.flatMap { host ->
            parserPaths.filter { path -> filters.none { it.verified && it.claims("https", host, path) } }
                .map { "$host$it" }
        }
        assertThat(unclaimed).isEmpty()
    }

    @Test
    fun `the parser really reads every path this guard claims`() {
        parserPaths.forEach { path ->
            val url = "https://meeshy.me$path".let { if (path == "/signup") "$it?ref=CODE" else if (path == "/reels") "$it?seed=r1" else it }
            assertThat(DeepLinkParser.isMeeshyDeepLink(url, "https://meeshy.me")).isTrue()
        }
    }

    @Test
    fun `an authentication token link is claimed over https only`() {
        val tokenMarkers = listOf("magic-link", "reset-password", "verify-email")
        val tokenFilters = filters.filter { filter ->
            (filter.exact + filter.prefixes).any { path -> tokenMarkers.any(path::contains) }
        }
        assertThat(tokenFilters).isNotEmpty()
        assertThat(tokenFilters.all { it.schemes == setOf("https") }).isTrue()
    }

    @Test
    fun `the share path is not claimed so the browser keeps it`() {
        assertThat(hosts.none { host -> filters.any { it.claims("https", host, "/share") } }).isTrue()
    }
}
