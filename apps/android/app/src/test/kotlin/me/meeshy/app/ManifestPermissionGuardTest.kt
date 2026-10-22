package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.app.i18n.ResourceTree
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Registre versionné des permissions : chaque <uses-permission> du manifeste de :app est justifiée
// dans permissions-registry.json, et celles qui ouvrent une invite runtime citent les textes
// d'explication (sdk-ui, media_permission_*_rationale_body) qui doivent exister dans les sept
// locales. Équivalent Android de la fiche PrivacyInfo.xcprivacy + NS*UsageDescription d'iOS.
@RunWith(RobolectricTestRunner::class)
class ManifestPermissionGuardTest {

    private val locales = listOf("", "-fr", "-es", "-pt", "-de", "-it", "-ar")

    private data class Entry(val name: String, val runtime: Boolean, val rationaleKeys: List<String>)

    private val root get() = ResourceTree.androidRoot()

    private fun manifestPermissions(manifest: String = File(root, "app/src/main/AndroidManifest.xml").readText()): Set<String> =
        Regex("<uses-permission[^>]*android:name=\"([^\"]+)\"").findAll(manifest).map { it.groupValues[1] }.toSet()

    private fun registry(json: String = File(root, "app/src/test/resources/manifest/permissions-registry.json").readText()): List<Entry> {
        val array = JSONObject(json).getJSONArray("permissions")
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            check(o.optString("justification").isNotBlank()) { "${o.getString("name")} sans justification" }
            check(o.optString("usage").isNotBlank()) { "${o.getString("name")} sans usage" }
            val keys = o.getJSONArray("rationaleKeys")
            Entry(o.getString("name"), o.getBoolean("runtime"), (0 until keys.length()).map(keys::getString))
        }
    }

    private fun unregistered(declared: Set<String>, entries: List<Entry>) = declared - entries.map { it.name }.toSet()

    private fun orphans(declared: Set<String>, entries: List<Entry>) = entries.map { it.name }.toSet() - declared

    private fun missingRationales(entries: List<Entry>, stringsByLocale: Map<String, String>): List<String> =
        entries.filter { it.runtime }.flatMap { entry ->
            if (entry.rationaleKeys.isEmpty()) listOf("${entry.name}: aucune clé d'explication")
            else entry.rationaleKeys.flatMap { key ->
                stringsByLocale.filterValues { !it.contains("name=\"$key\"") }.keys.map { "${entry.name}: $key absent de values$it" }
            }
        }

    private fun sdkUiStrings(): Map<String, String> = locales.associateWith { locale ->
        File(root, "sdk-ui/src/main/res/values$locale/strings_media_permissions.xml").takeIf { it.isFile }?.readText().orEmpty()
    }

    @Test
    fun `every permission of the manifest is justified in the registry`() {
        assertThat(unregistered(manifestPermissions(), registry())).isEmpty()
    }

    @Test
    fun `a permission added to the manifest without a registry entry is caught`() {
        val manifest = "<uses-permission android:name=\"android.permission.READ_SMS\" />"
        assertThat(unregistered(manifestPermissions(manifest), registry())).containsExactly("android.permission.READ_SMS")
    }

    @Test
    fun `every registry entry is still declared in the manifest`() {
        assertThat(orphans(manifestPermissions(), registry())).isEmpty()
    }

    @Test
    fun `a registry entry with no permission in the manifest is caught`() {
        val manifest = "<uses-permission android:name=\"android.permission.INTERNET\" />"
        assertThat(orphans(manifestPermissions(manifest), registry())).contains("android.permission.CAMERA")
    }

    @Test
    fun `every runtime prompt permission has its explanation text in the seven locales`() {
        assertThat(missingRationales(registry(), sdkUiStrings())).isEmpty()
    }

    @Test
    fun `a runtime permission without explanation text is caught`() {
        val entries = listOf(Entry("android.permission.RECORD_AUDIO", true, emptyList()))
        assertThat(missingRationales(entries, sdkUiStrings())).hasSize(1)
        val unknownKey = listOf(Entry("android.permission.CAMERA", true, listOf("media_permission_nope_rationale_body")))
        assertThat(missingRationales(unknownKey, sdkUiStrings())).hasSize(locales.size)
    }

    @Test
    fun `the four mandatory runtime prompts are flagged runtime`() {
        val runtime = registry().filter { it.runtime }.map { it.name }
        assertThat(runtime).containsAtLeast(
            "android.permission.RECORD_AUDIO",
            "android.permission.CAMERA",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.POST_NOTIFICATIONS",
        )
    }

    @Test
    fun `planned capability permissions are not yet in the manifest`() {
        val planned = JSONObject(File(root, "app/src/test/resources/manifest/permissions-registry.json").readText()).getJSONArray("planned")
        val names = (0 until planned.length()).map { planned.getJSONObject(it).getString("permission") }
        assertThat(names).isNotEmpty()
        assertThat(manifestPermissions().intersect(names.toSet())).isEmpty()
    }
}
