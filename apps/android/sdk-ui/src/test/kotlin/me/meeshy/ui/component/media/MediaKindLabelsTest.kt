package me.meeshy.ui.component.media

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ComposerMode
import me.meeshy.sdk.model.media.MediaKindLabel
import me.meeshy.sdk.model.media.MediaKindLabel.Kind
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaKindLabelsTest {
    private fun strings(): ResourceMediaKindStrings {
        val app = ApplicationProvider.getApplicationContext<Application>()
        return ResourceMediaKindStrings(app)
    }

    @Test @Config(qualifiers = "en")
    fun `anglais`() {
        val s = strings()
        assertThat(MediaKindLabel.name(Kind.PHOTO, s)).isEqualTo("Photo")
        assertThat(MediaKindLabel.summary(Kind.AUDIO, s)).isEqualTo("🎙️ Voice message")
        assertThat(MediaKindLabel.voiceRecording(12.0, s)).isEqualTo("Voice message (0:12)")
    }

    @Test @Config(qualifiers = "fr")
    fun `francais`() {
        val s = strings()
        assertThat(MediaKindLabel.name(Kind.VIDEO, s)).isEqualTo("Vidéo")
        assertThat(MediaKindLabel.summary(Kind.VIDEO, s)).isEqualTo("🎥 Vidéo")
        assertThat(MediaKindLabel.summary(Kind.LOCATION, s)).isEqualTo("📍 Position")
        assertThat(MediaKindLabel.voiceRecording(12.0, s)).isEqualTo("Message vocal (0:12)")
        assertThat(s.spokenDuration(12.0)).isEqualTo("12 secondes")
    }

    @Test @Config(qualifiers = "es")
    fun `espagnol`() {
        val s = strings()
        assertThat(MediaKindLabel.name(Kind.FILE, s)).isEqualTo("Archivo")
        assertThat(MediaKindLabel.summary(Kind.AUDIO, s)).isEqualTo("🎙️ Mensaje de voz")
    }

    @Test @Config(qualifiers = "pt")
    fun `portugais`() {
        val s = strings()
        assertThat(MediaKindLabel.summary(Kind.AUDIO, s)).isEqualTo("🎙️ Mensagem de voz")
        assertThat(MediaKindLabel.voiceRecording(65.0, s)).isEqualTo("Mensagem de voz (1:05)")
    }

    @Test @Config(qualifiers = "fr")
    fun `chaque mode de composeur a un placeholder en ressource`() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        ComposerMode.entries.forEach {
            assertThat(app.getString(it.placeholderRes())).isNotEmpty()
        }
        assertThat(app.getString(ComposerMode.POST.placeholderRes())).isEqualTo("Quoi de neuf ?")
    }
}
