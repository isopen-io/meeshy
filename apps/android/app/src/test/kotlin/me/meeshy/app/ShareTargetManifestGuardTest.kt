package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * « Partager vers Meeshy » (#13585) : l'extension iOS s'active pour du texte, un lien, des images, des vidéos ET des
 * fichiers quelconques. Une sélection mêlant photos et vidéos arrive typée d'un type générique et un PDF `application/pdf` : sans filtre
 * de ce type Meeshy n'apparaît pas dans le sélecteur système. L'admission reste jugée par
 * `InboundMediaPolicy.admitsSource` dans l'activité, pas par le manifeste.
 */
class ShareTargetManifestGuardTest {

    private fun manifest(): String {
        val module = listOf(File("."), File("app")).first { File(it, "src/main/AndroidManifest.xml").isFile }
        return File(module, "src/main/AndroidManifest.xml").readText()
    }

    private fun shareActivity(): String =
        Regex("<activity\\b[^>]*android:name=\"\\.ShareTargetActivity\"[\\s\\S]*?</activity>").find(manifest())?.value
            ?: error("ShareTargetActivity absente du manifeste")

    private fun mimeTypesFor(action: String): List<String> =
        Regex("<intent-filter>[\\s\\S]*?</intent-filter>").findAll(shareActivity())
            .map { it.value }
            .filter { "android:name=\"$action\"" in it }
            .flatMap { filter -> Regex("android:mimeType=\"([^\"]+)\"").findAll(filter).map { it.groupValues[1] } }
            .toList()

    @Test
    fun `a single share of any file, document or mixed selection reaches Meeshy`() {
        assertThat(mimeTypesFor("android.intent.action.SEND")).containsAtLeast("text/plain", "*/*")
    }

    @Test
    fun `a multiple share of any mix of photos, videos and documents reaches Meeshy`() {
        assertThat(mimeTypesFor("android.intent.action.SEND_MULTIPLE")).contains("*/*")
    }

    @Test
    fun `every share filter is a default-category filter and the activity stays a recents-free relay`() {
        val activity = shareActivity()
        val filters = Regex("<intent-filter>[\\s\\S]*?</intent-filter>").findAll(activity).map { it.value }.toList()
        assertThat(filters).isNotEmpty()
        filters.forEach { assertThat(it).contains("android.intent.category.DEFAULT") }
        assertThat(activity).contains("android:excludeFromRecents=\"true\"")
    }
}
