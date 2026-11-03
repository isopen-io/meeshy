package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.sdk.model.licenses.LibsignalNotices
import org.junit.Test

/**
 * The AGPL-3.0 texts the licenses screen shows OFFLINE (#14628). The raw AGPL text is a copy of the
 * repository's `LICENSES/AGPL-3.0.txt` (official FSF text) and must stay byte-identical to it; the
 * libsignal notices are Signal's acknowledgments for Android at the pinned tag.
 */
class LicensesAgplResourcesTest {

    private val androidRoot = SettingsResourceTree.androidRoot()
    private val raw = File(androidRoot, "feature/settings/src/main/res/raw")

    @Test
    fun `le texte AGPL embarque est celui de LICENSES a l octet pres`() {
        val official = File(androidRoot.parentFile.parentFile, "LICENSES/AGPL-3.0.txt").readBytes()
        assertWithMessage("res/raw/agpl_3_0.txt diverge de LICENSES/AGPL-3.0.txt")
            .that(File(raw, "agpl_3_0.txt").readBytes().contentEquals(official)).isTrue()
    }

    @Test
    fun `les avis de libsignal embarques nomment libsignal sous AGPL`() {
        val notices = LibsignalNotices.parse(File(raw, "libsignal_acknowledgments.md").readText())
        assertThat(notices.size).isGreaterThan(100)
        assertThat(notices.any { it.title.contains("libsignal-protocol") && it.text.contains("GNU AFFERO GENERAL PUBLIC LICENSE") }).isTrue()
    }

    @Test
    fun `l ecran des licences monte la licence de Meeshy et les avis de libsignal`() {
        val screen = File(androidRoot, "feature/settings/src/main/kotlin/me/meeshy/app/settings/LicensesScreen.kt").readText()
        assertThat(screen).contains("MeeshyLicenseSection(")
        assertThat(screen).contains("LibsignalNoticesSection(")
        assertThat(screen).contains("LicenseTextDialog(")
    }

    @Test
    fun `la navigation transmet le commit du build`() {
        val graph = File(androidRoot, "app/src/main/kotlin/me/meeshy/app/navigation/graph/SettingsNavGraph.kt").readText()
        assertThat(graph).contains("sourceCommit = BuildConfig.SOURCE_COMMIT")
    }
}
