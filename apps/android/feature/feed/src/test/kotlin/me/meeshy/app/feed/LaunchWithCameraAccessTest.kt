package me.meeshy.app.feed

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
}
