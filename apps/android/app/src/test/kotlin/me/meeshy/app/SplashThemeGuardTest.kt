package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

// Source guard: the app shipped with ZERO splash-screen treatment until this slice — no
// `androidx.core:core-splashscreen` dependency anywhere in the version catalog, and
// `themes.xml` declared a single bare `Theme.Meeshy` with no splash style at all, so a cold
// start on API < 31 flashed a blank white/black window before the first Compose frame (and
// even API 31+'s OS-generated splash used only the plain launcher icon, no brand background
// control). Found via direct inspection during the routine's periodic "categorical audit
// blind spot" sweep — `feature-parity.md`'s "Splash screen with brand animation + minimum
// display duration" bullet (§A) had existed as an unchecked line for several runs without
// anyone re-opening the actual `themes.xml`/`AndroidManifest.xml`/version catalog to confirm
// the gap was still real (it was).
//
// This spec anchors on the shipped ARTIFACT (manifest text, theme style file, version
// catalog, gradle dependency), the same shape as `LauncherIconManifestGuardTest`: it guards
// against (1) the wiring being silently dropped again, and (2) the manifest/theme pointing at
// a resource id that no longer exists on disk.
class SplashThemeGuardTest {

    private fun appModuleDir(): File {
        val fromModule = File(".")
        if (File(fromModule, "src/main/AndroidManifest.xml").isFile) return fromModule
        val fromRepoRoot = File("app")
        check(File(fromRepoRoot, "src/main/AndroidManifest.xml").isFile) {
            "could not locate the app module's AndroidManifest.xml from ${fromModule.absolutePath}"
        }
        return fromRepoRoot
    }

    private fun androidRootDir(): File {
        val app = appModuleDir().canonicalFile
        val candidate = if (File(app, "gradle/libs.versions.toml").isFile) app else app.parentFile
        check(File(candidate, "gradle/libs.versions.toml").isFile) {
            "could not locate gradle/libs.versions.toml from ${candidate.absolutePath}"
        }
        return candidate
    }

    private fun manifestText(): String =
        File(appModuleDir(), "src/main/AndroidManifest.xml").readText()

    private fun themesText(): String =
        File(appModuleDir(), "src/main/res/values/themes.xml").readText()

    private fun resDir(): File = File(appModuleDir(), "src/main/res")

    @Test
    fun `the MainActivity element declares the splash starting theme`() {
        val activityTag = Regex("<activity\\b[^>]*android:name=\"\\.MainActivity\"[\\s\\S]*?>")
            .find(manifestText())?.value
        checkNotNull(activityTag) { "no <activity android:name=\".MainActivity\"> element found" }

        assertThat(activityTag).contains("android:theme=\"@style/Theme.Meeshy.Starting\"")
    }

    @Test
    fun `the splash starting theme declares background, icon and post-splash theme`() {
        val text = themesText()
        val styleBlock = Regex(
            "<style\\s+name=\"Theme\\.Meeshy\\.Starting\"[^>]*>([\\s\\S]*?)</style>",
        ).find(text)?.groupValues?.get(1)
        checkNotNull(styleBlock) { "no Theme.Meeshy.Starting style found in themes.xml" }

        assertThat(styleBlock).contains("windowSplashScreenBackground")
        assertThat(styleBlock).contains("@color/splash_background")
        assertThat(styleBlock).contains("windowSplashScreenAnimatedIcon")
        assertThat(styleBlock).contains("@drawable/ic_launcher_foreground")
        assertThat(styleBlock).contains("postSplashScreenTheme")
        assertThat(styleBlock).contains("@style/Theme.Meeshy")
    }

    @Test
    fun `every resource the splash theme references exists on disk`() {
        assertWithMessage("res/values/colors.xml")
            .that(File(resDir(), "values/colors.xml").isFile)
            .isTrue()
        assertThat(File(resDir(), "values/colors.xml").readText()).contains("name=\"splash_background\"")

        assertWithMessage("res/drawable/ic_launcher_foreground.xml")
            .that(File(resDir(), "drawable/ic_launcher_foreground.xml").isFile)
            .isTrue()
    }

    @Test
    fun `core-splashscreen is declared in the version catalog and wired into the app module`() {
        val catalog = File(androidRootDir(), "gradle/libs.versions.toml").readText()
        assertThat(catalog).contains("androidx.core:core-splashscreen")

        val alias = Regex(
            "androidx-core-splashscreen\\s*=\\s*\\{[^}]*version\\.ref\\s*=\\s*\"([a-zA-Z0-9]+)\"",
        ).find(catalog)?.groupValues?.get(1)
        checkNotNull(alias) { "no androidx-core-splashscreen library alias found in libs.versions.toml" }
        assertThat(catalog).contains("$alias = \"")

        val appBuildGradle = File(appModuleDir(), "build.gradle.kts").readText()
        assertThat(appBuildGradle).contains("libs.androidx.core.splashscreen")
    }

    @Test
    fun `MainActivity installs the splash screen before super onCreate`() {
        val mainActivity =
            File(appModuleDir(), "src/main/kotlin/me/meeshy/app/MainActivity.kt").readText()
        val onCreateBody = Regex("override fun onCreate\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n {4}\\}")
            .find(mainActivity)?.groupValues?.get(1)
        checkNotNull(onCreateBody) { "could not locate MainActivity.onCreate's body" }

        val installIndex = onCreateBody.indexOf("installSplashScreen()")
        val superIndex = onCreateBody.indexOf("super.onCreate(")
        assertWithMessage("installSplashScreen() call present").that(installIndex).isAtLeast(0)
        assertWithMessage("super.onCreate(...) call present").that(superIndex).isAtLeast(0)
        assertWithMessage("installSplashScreen() must run BEFORE super.onCreate()")
            .that(installIndex)
            .isLessThan(superIndex)
    }
}
