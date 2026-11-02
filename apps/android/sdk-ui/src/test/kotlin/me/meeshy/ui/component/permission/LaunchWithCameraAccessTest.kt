package me.meeshy.ui.component.permission

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class LaunchWithCameraAccessTest {

    @Test
    fun `a granted camera starts the capture`() = runTest {
        var started = 0

        val result = launchWithCameraAccess(ensureAccess = { true }, launch = { started++ })

        assertThat(result).isTrue()
        assertThat(started).isEqualTo(1)
    }

    @Test
    fun `a refused camera never starts the capture`() = runTest {
        var started = 0

        val result = launchWithCameraAccess(ensureAccess = { false }, launch = { started++ })

        assertThat(result).isFalse()
        assertThat(started).isEqualTo(0)
    }

    @Test
    fun `a permission revoked between the check and the start does not crash`() = runTest {
        val result = launchWithCameraAccess(
            ensureAccess = { true },
            launch = { throw SecurityException("Permission Denial: revoked permission android.permission.CAMERA") },
        )

        assertThat(result).isFalse()
    }

    @Test
    fun `a missing camera app does not crash`() = runTest {
        val result = launchWithCameraAccess(
            ensureAccess = { true },
            launch = { throw android.content.ActivityNotFoundException("no camera app") },
        )

        assertThat(result).isFalse()
    }

    @Test
    fun `every system camera capture site goes through the camera gate`() {
        val root = me.meeshy.ui.icons.IconsTestSupport.androidRoot
        val captureContract = Regex("ActivityResultContracts\\.(TakePicture|CaptureVideo)\\(\\)|MediaStore\\.ACTION_(IMAGE|VIDEO)_CAPTURE")
        val captureSites = root.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" && it.name != "test" && it.name != "androidTest" }
            .filter { it.isFile && it.extension == "kt" && captureContract.containsMatchIn(it.readText()) }
            .map { it.relativeTo(root).invariantSeparatorsPath }
            .toList()
        val feature = { path: String -> path.substringBefore("/src/") }
        val gatedFeatures = root.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" && it.name != "test" && it.name != "androidTest" }
            .filter { it.isFile && it.extension == "kt" && it.readText().contains("launchWithCameraAccess(") }
            .map { feature(it.relativeTo(root).invariantSeparatorsPath) }
            .toSet()

        assertThat(captureSites).isNotEmpty()
        assertThat(captureSites.map(feature).filterNot { it in gatedFeatures || it == "sdk-ui" }).isEmpty()
    }
}
