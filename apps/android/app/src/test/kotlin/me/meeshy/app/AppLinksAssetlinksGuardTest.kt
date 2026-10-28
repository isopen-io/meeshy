package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.i18n.ResourceTree
import org.json.JSONArray
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Les App Links https vérifiés (autoVerify) du manifeste et le assetlinks.json servi par
// apps/web/public/.well-known doivent concorder avec associated-domains iOS, sauf api. et gate.
// (hôtes d'API, aucune page à ouvrir dans l'app : décision consignée dans docs/magic-link-app-links.md).
@RunWith(RobolectricTestRunner::class)
class AppLinksAssetlinksGuardTest {

    private val root get() = ResourceTree.androidRoot()
    private val manifest get() = File(root, "app/src/main/AndroidManifest.xml").readText()
    private val repo get() = root.parentFile.parentFile

    private val handleAll = "delegate_permission/common.handle_all_urls"
    private val loginCreds = "delegate_permission/common.get_login_creds"

    private data class Link(val host: String, val path: String)

    private fun autoVerifyLinks(): List<Link> =
        Regex("<intent-filter android:autoVerify=\"true\">(.*?)</intent-filter>", RegexOption.DOT_MATCHES_ALL)
            .findAll(manifest.replace(Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL), "")).flatMap { filter ->
                Regex("android:host=\"([^\"]+)\" android:pathPrefix=\"([^\"]+)\"").findAll(filter.groupValues[1])
                    .map { Link(it.groupValues[1], it.groupValues[2]) }
            }.toList()

    private fun assetlinks(): JSONArray =
        JSONArray(File(repo, "apps/web/public/.well-known/assetlinks.json").readText())

    private fun targets(): Map<String, Pair<List<String>, List<String>>> =
        (0 until assetlinks().length()).associate { i ->
            val o = assetlinks().getJSONObject(i)
            val rel = o.getJSONArray("relation").let { r -> (0 until r.length()).map(r::getString) }
            val target = o.getJSONObject("target")
            val fp = target.getJSONArray("sha256_cert_fingerprints").let { f -> (0 until f.length()).map(f::getString) }
            target.getString("package_name") to (rel to fp)
        }

    @Test
    fun `meeshy me and www meeshy me verify every path the app opens`() {
        val links = autoVerifyLinks()
        val paths = listOf("/auth/magic-link", "/u/", "/chat/", "/join/", "/feeds/post/", "/post/", "/reel/", "/story/")
        listOf("meeshy.me", "www.meeshy.me").forEach { host ->
            assertThat(links.filter { it.host == host }.map { it.path }).containsAtLeastElementsIn(paths)
        }
    }

    @Test
    fun `api hosts are not verified app links`() {
        assertThat(autoVerifyLinks().map { it.host }.toSet()).containsExactly("meeshy.me", "www.meeshy.me")
        assertThat(exactPathLinks().map { it.host }.toSet()).containsExactly("meeshy.me", "www.meeshy.me")
    }

    private fun exactPathLinks(): List<Link> =
        Regex("<intent-filter android:autoVerify=\"true\">(.*?)</intent-filter>", RegexOption.DOT_MATCHES_ALL)
            .findAll(manifest.replace(Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL), "")).flatMap { filter ->
                Regex("android:host=\"([^\"]+)\" android:path=\"([^\"]+)\"").findAll(filter.groupValues[1])
                    .map { Link(it.groupValues[1], it.groupValues[2]) }
            }.toList()

    // #13465 : les e-mails de reinitialisation / verification s'ouvrent dans l'app. Chemins EXACTS — la forme que
    // LaunchRouter lit — jamais un prefixe : un lien d'e-mail que l'app ne lit pas (revocation, suppression de compte)
    // serait avale sans rien afficher au lieu d'aller au navigateur.
    @Test
    fun `reset and verification email links are verified by exact path on both hosts`() {
        val paths = listOf("/reset-password", "/auth/reset-password", "/auth/verify-email")
        listOf("meeshy.me", "www.meeshy.me").forEach { host ->
            assertThat(exactPathLinks().filter { it.host == host }.map { it.path }).containsAtLeastElementsIn(paths)
        }
    }

    // #10859 / #10868 : les alias `/auth/email-link/…` ne sont JAMAIS des App Links — seules les adresses canoniques
    // le sont ; le web redirige l'alias côté navigateur, et les versions publiées ne doivent pas les recevoir.
    @Test
    fun `email link aliases are never claimed as app links`() {
        val aliases = listOf(
            "/auth/email-link/reset-password", "/auth/email-link/verify-email", "/auth/email-link/magic-link",
        )
        assertThat(exactPathLinks().map { it.path }).containsNoneIn(aliases)
    }

    @Test
    fun `no prefix claim reaches an email link the app does not read`() {
        val unread = listOf(
            "/auth/email-link", "/auth/revoke-sessions", "/account/deletion", "/settings/verify-email-change",
            "/auth/reset-password/", "/reset-password/",
        )
        val prefixes = autoVerifyLinks().map { it.path }
        unread.forEach { path -> assertThat(prefixes.any { path.startsWith(it) && it != "/auth/magic-link" }).isFalse() }
        assertThat(exactPathLinks().map { it.path }).containsNoneIn(unread)
    }

    // #13464 : `/stories/new` (composer) et `/stories/mine` (archive) sont des PAGES du web, et iOS ne revendique que
    // `/story/*` (apple-app-site-association). Un prefixe `/stories/` les avalait dans un detail de post introuvable.
    @Test
    fun `no prefix claim reaches a web page the app does not open`() {
        val webPages = listOf("/stories/new", "/stories/mine", "/reels")
        val prefixes = autoVerifyLinks().map { it.path }
        webPages.forEach { page -> assertThat(prefixes.filter { page.startsWith(it) }).isEmpty() }
    }

    @Test
    fun `native debug package is verified with both relations and a fingerprint`() {
        val entry = targets().getValue("me.meeshy.app.debug")
        assertThat(entry.first).containsExactly(handleAll, loginCreds)
        assertThat(entry.second).isNotEmpty()
    }

    // #13619 : la native a repris la fiche Play `me.meeshy.app` de la coque, avec sa clé de signature.
    @Test
    fun `the app entries keep the store signing fingerprints`() {
        val t = targets()
        assertThat(t.getValue("me.meeshy.app").second)
            .containsExactly("57:AC:19:83:D4:AE:A5:2F:99:09:E4:28:B5:8F:AC:7F:34:71:38:C9:E3:B7:74:4D:74:3E:4A:C2:65:83:5C:AA")
        assertThat(t.getValue("me.meeshy.app.debug").second)
            .containsExactly("6B:E2:95:F8:20:33:A2:7E:33:37:13:D4:F4:9B:D2:D7:F5:B2:7D:DA:0D:D7:B7:0E:42:30:07:16:B9:33:D6:76")
        listOf("me.meeshy.app", "me.meeshy.app.debug").forEach {
            assertThat(t.getValue(it).first).containsExactly(handleAll, loginCreds)
        }
    }

    @Test
    fun `native release package is verified with both relations and a fingerprint`() {
        val entry = targets().getValue("me.meeshy.app")
        assertThat(entry.first).containsExactly(handleAll, loginCreds)
        assertThat(entry.second).isNotEmpty()
    }
}
