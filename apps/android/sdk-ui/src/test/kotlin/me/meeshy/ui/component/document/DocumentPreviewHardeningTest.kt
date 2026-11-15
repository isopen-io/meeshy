package me.meeshy.ui.component.document

import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DocumentPreviewHardeningTest {

    private fun hardened(): WebView =
        WebView(ApplicationProvider.getApplicationContext()).also(::hardenDocumentWebView)

    @Test
    fun `la vue ne lance aucun script et ne lit ni les fichiers de l'app ni le reseau`() {
        val settings = hardened().settings
        assertThat(settings.javaScriptEnabled).isFalse()
        assertThat(settings.allowFileAccess).isFalse()
        assertThat(settings.allowUniversalAccessFromFileURLs).isFalse()
        assertThat(settings.blockNetworkLoads).isTrue()
        assertThat(settings.domStorageEnabled).isFalse()
    }

    @Test
    fun `l'appui long est consomme et rien ne s'emporte par la vue`() {
        val view = hardened()
        assertThat(view.isLongClickable).isFalse()
        assertThat(shadowOf(view).onLongClickListener.onLongClick(view)).isTrue()
        assertThat(view.isHapticFeedbackEnabled).isFalse()
    }
}
