package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.i18n.ResourceTree
import org.junit.Test

// Le trafic en clair est refusé en release. Seule la variante debug du fichier (source set
// app/src/debug, qui remplace celle de main dans l'APK debug) ouvre localhost et 10.0.2.2.
class NetworkSecurityGuardTest {

    private val root get() = ResourceTree.androidRoot()
    private val release get() = File(root, "app/src/main/res/xml/network_security_config.xml").readText()
    private val debug get() = File(root, "app/src/debug/res/xml/network_security_config.xml").readText()
    private val manifest get() = File(root, "app/src/main/AndroidManifest.xml").readText()

    private fun withoutComments(xml: String) = xml.replace(Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL), "")

    @Test
    fun `the manifest points at the network security config and the extraction rules`() {
        assertThat(manifest).contains("android:networkSecurityConfig=\"@xml/network_security_config\"")
        assertThat(manifest).contains("android:dataExtractionRules=\"@xml/data_extraction_rules\"")
        assertThat(manifest).contains("android:allowBackup=\"false\"")
        assertThat(manifest).doesNotContain("usesCleartextTraffic=\"true\"")
    }

    @Test
    fun `release base config forbids cleartext and declares no exception`() {
        val xml = withoutComments(release)
        assertThat(xml).contains("<base-config cleartextTrafficPermitted=\"false\"")
        assertThat(xml).doesNotContain("cleartextTrafficPermitted=\"true\"")
        assertThat(xml).doesNotContain("<domain-config")
        assertThat(xml).doesNotContain("<debug-overrides")
    }

    @Test
    fun `debug variant keeps the base closed and only opens the development targets`() {
        val xml = withoutComments(debug)
        assertThat(xml).contains("<base-config cleartextTrafficPermitted=\"false\"")
        val domains = Regex("<domain [^>]*>([^<]+)</domain>").findAll(xml).map { it.groupValues[1].trim() }.toList()
        assertThat(domains).containsExactly("localhost", "10.0.2.2")
        assertThat(Regex("cleartextTrafficPermitted=\"true\"").findAll(xml).count()).isEqualTo(1)
    }

    @Test
    fun `no source set but debug overrides the config`() {
        val variants = File(root, "app/src").listFiles().orEmpty()
            .filter { File(it, "res/xml/network_security_config.xml").isFile }.map { it.name }
        assertThat(variants).containsExactly("main", "debug")
    }

    @Test
    fun `device extraction rules exclude database, preferences and files from cloud and transfer`() {
        val xml = File(root, "app/src/main/res/xml/data_extraction_rules.xml").readText()
        listOf("cloud-backup", "device-transfer").forEach { section ->
            val body = Regex("<$section>(.*?)</$section>", RegexOption.DOT_MATCHES_ALL).find(xml)?.groupValues?.get(1).orEmpty()
            listOf("database", "sharedpref", "file", "root").forEach { domain ->
                assertThat(body).contains("<exclude domain=\"$domain\"")
            }
            assertThat(body).doesNotContain("<include")
        }
    }
}
