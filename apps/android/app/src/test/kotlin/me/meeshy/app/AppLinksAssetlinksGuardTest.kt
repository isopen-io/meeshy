package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.i18n.ResourceTree
import org.json.JSONArray
import org.junit.Ignore
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
        val paths = listOf("/auth/magic-link", "/u/", "/chat/", "/join/", "/feeds/post/", "/post/")
        listOf("meeshy.me", "www.meeshy.me").forEach { host ->
            assertThat(links.filter { it.host == host }.map { it.path }).containsAtLeastElementsIn(paths)
        }
    }

    @Test
    fun `api hosts are not verified app links`() {
        assertThat(autoVerifyLinks().map { it.host }.toSet()).containsExactly("meeshy.me", "www.meeshy.me")
    }

    @Test
    fun `native debug package is verified with both relations and a fingerprint`() {
        val entry = targets().getValue("me.meeshy.android.debug")
        assertThat(entry.first).containsExactly(handleAll, loginCreds)
        assertThat(entry.second).isNotEmpty()
    }

    @Test
    fun `the shell entries are unchanged`() {
        val t = targets()
        assertThat(t.getValue("me.meeshy.app").second)
            .containsExactly("57:AC:19:83:D4:AE:A5:2F:99:09:E4:28:B5:8F:AC:7F:34:71:38:C9:E3:B7:74:4D:74:3E:4A:C2:65:83:5C:AA")
        assertThat(t.getValue("me.meeshy.app.debug").second)
            .containsExactly("6B:E2:95:F8:20:33:A2:7E:33:37:13:D4:F4:9B:D2:D7:F5:B2:7D:DA:0D:D7:B7:0E:42:30:07:16:B9:33:D6:76")
        listOf("me.meeshy.app", "me.meeshy.app.debug").forEach {
            assertThat(t.getValue(it).first).containsExactly(handleAll, loginCreds)
        }
    }

    // ext:empreinte-signature-release — le porteur fournit le SHA-256 de la clé de signature
    // release (Play App Signing). Retirer @Ignore dès que l'entrée me.meeshy.android est posée :
    // tant qu'elle manque, les liens vérifiés ne s'ouvrent pas dans l'app installée du Play Store.
    @Ignore("en attente de l'empreinte release fournie par le porteur (ext:empreinte-signature-release)")
    @Test
    fun `native release package is verified with both relations and a fingerprint`() {
        val entry = targets().getValue("me.meeshy.android")
        assertThat(entry.first).containsExactly(handleAll, loginCreds)
        assertThat(entry.second).isNotEmpty()
    }
}
