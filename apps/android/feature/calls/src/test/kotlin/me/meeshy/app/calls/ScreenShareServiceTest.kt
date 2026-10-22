package me.meeshy.app.calls

import android.content.Intent
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import org.robolectric.RuntimeEnvironment
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ScreenShareServiceTest {
    private val original = ScreenShareService.projectionFactory

    @After
    fun restore() {
        ScreenShareService.projectionFactory = original
    }

    private fun intent() =
        Intent(RuntimeEnvironment.getApplication(), ScreenShareService::class.java)
            .putExtra("resultCode", -1)
            .putExtra("grant", Intent("grant"))

    @Test
    fun `destroying the service releases the projection`() {
        val projection = mockk<MediaProjection>(relaxed = true)
        ScreenShareService.projectionFactory = { _, _, _ -> projection }
        val controller = Robolectric.buildService(ScreenShareService::class.java, intent()).create().startCommand(0, 1)
        controller.destroy()
        verify(exactly = 1) { projection.stop() }
    }

    @Test
    fun `a start without a grant stops itself and acquires nothing`() {
        var acquired = false
        ScreenShareService.projectionFactory = { _, _, _ -> acquired = true; null }
        val bare = Intent(RuntimeEnvironment.getApplication(), ScreenShareService::class.java)
        Robolectric.buildService(ScreenShareService::class.java, bare).create().startCommand(0, 1)
        assertThat(acquired).isFalse()
    }
}
