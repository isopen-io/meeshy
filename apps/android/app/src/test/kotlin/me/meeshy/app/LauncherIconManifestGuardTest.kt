package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

// Source guard: the app shipped with NO launcher icon at all until this slice —
// `apps/android/app/src/main/res/` had no `mipmap-*` and no icon asset, and
// `<application>` in AndroidManifest.xml carried neither `android:icon` nor
// `android:roundIcon`, so every install rendered the generic Android launcher
// icon (found via direct inspection, absent from feature-parity.md since the
// integral iOS audit only read `.swift` files and never iOS's `.xcassets`
// asset catalogs — see feature-parity.md's "App icon" bullet under
// "Q. Cross-cutting infrastructure").
//
// This spec anchors on the shipped ARTIFACT (manifest text + resource files
// on disk), not on any icon-selection "logic" — there isn't any, Android
// resolves `mipmap-anydpi-v26/ic_launcher.xml` automatically for a minSdk 26
// app. It guards two independent regressions: (1) the manifest attributes
// silently dropped again, and (2) the manifest pointing at a resource id that
// no longer exists on disk (a rename/move without updating the reference).
class LauncherIconManifestGuardTest {

    private fun appModuleDir(): File {
        val fromModule = File(".")
        if (File(fromModule, "src/main/AndroidManifest.xml").isFile) return fromModule
        val fromRepoRoot = File("app")
        check(File(fromRepoRoot, "src/main/AndroidManifest.xml").isFile) {
            "could not locate the app module's AndroidManifest.xml from ${fromModule.absolutePath}"
        }
        return fromRepoRoot
    }

    private fun manifestText(): String =
        File(appModuleDir(), "src/main/AndroidManifest.xml").readText()

    private fun resDir(): File = File(appModuleDir(), "src/main/res")

    @Test
    fun `application element declares an icon and a round icon`() {
        val applicationTag = Regex("<application\\b[^>]*>").find(manifestText())?.value
        checkNotNull(applicationTag) { "no <application> element found in AndroidManifest.xml" }

        assertThat(applicationTag).contains("android:icon=\"@mipmap/ic_launcher\"")
        assertThat(applicationTag).contains("android:roundIcon=\"@mipmap/ic_launcher_round\"")
    }

    @Test
    fun `the adaptive icon XML exists and references drawables that exist`() {
        val adaptiveIcon = File(resDir(), "mipmap-anydpi-v26/ic_launcher.xml")
        check(adaptiveIcon.isFile) { "missing ${adaptiveIcon.path}" }
        val adaptiveIconRound = File(resDir(), "mipmap-anydpi-v26/ic_launcher_round.xml")
        check(adaptiveIconRound.isFile) { "missing ${adaptiveIconRound.path}" }

        val drawableRefs = Regex("@drawable/([a-z_0-9]+)")
            .findAll(adaptiveIcon.readText())
            .map { it.groupValues[1] }
            .toSet()

        assertThat(drawableRefs).containsAtLeast(
            "ic_launcher_background",
            "ic_launcher_foreground",
            "ic_launcher_monochrome",
        )
        drawableRefs.forEach { name ->
            assertWithMessage("drawable/$name.xml exists")
                .that(File(resDir(), "drawable/$name.xml").isFile)
                .isTrue()
        }
    }

    @Test
    fun `every legacy density ships both the square and round launcher PNG`() {
        val densities = listOf("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")

        densities.forEach { density ->
            val square = File(resDir(), "mipmap-$density/ic_launcher.png")
            val round = File(resDir(), "mipmap-$density/ic_launcher_round.png")
            assertWithMessage(square.path).that(square.isFile).isTrue()
            assertWithMessage(round.path).that(round.isFile).isTrue()
        }
    }
}
