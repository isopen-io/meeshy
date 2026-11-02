package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class NetworkSecurityConfigGuardTest {

    private fun appFile(path: String): File? =
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "app/src/$path/res/xml/network_security_config.xml") }
            .firstOrNull { it.exists() }

    @Test
    fun `la release refuse tout trafic en clair et n'ouvre aucun domaine`() {
        val xml = appFile("main")?.readText() ?: return
        assertThat(xml).contains("cleartextTrafficPermitted=\"false\"")
        assertThat(xml).doesNotContain("cleartextTrafficPermitted=\"true\"")
    }

    @Test
    fun `seuls localhost et l'alias emulateur sont autorises en clair en debug`() {
        val xml = appFile("debug")?.readText() ?: return
        val domains = Regex("<domain[^>]*>([^<]+)</domain>").findAll(xml).map { it.groupValues[1] }.toList()
        assertThat(domains).containsExactly("localhost", "10.0.2.2")
    }
}
