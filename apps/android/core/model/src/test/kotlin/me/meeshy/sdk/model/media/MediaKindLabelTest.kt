package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaKindLabel.Kind
import org.junit.Test

class MediaKindLabelTest {
    private val strings = object : MediaKindStrings {
        override fun name(kind: Kind) = when (kind) {
            Kind.PHOTO -> "Photo"; Kind.VIDEO -> "Vidéo"; Kind.AUDIO -> "Audio"
            Kind.FILE -> "Fichier"; Kind.LOCATION -> "Position"
        }
        override fun summary(kind: Kind) = when (kind) {
            Kind.PHOTO -> "📷 Photo"; Kind.VIDEO -> "🎥 Vidéo"; Kind.AUDIO -> "🎙️ Message vocal"
            Kind.FILE -> "📎 Fichier"; Kind.LOCATION -> "📍 Position"
        }
        override val voiceMessage = "Message vocal"
        override fun voiceRecording(formattedDuration: String) = "Message vocal ($formattedDuration)"
    }

    @Test fun `name et summary passent par la table`() {
        assertThat(MediaKindLabel.name(Kind.PHOTO, strings)).isEqualTo("Photo")
        assertThat(MediaKindLabel.summary(Kind.AUDIO, strings)).isEqualTo("🎙️ Message vocal")
    }

    @Test fun `vocal enregistre`() {
        assertThat(MediaKindLabel.voiceRecording(12.0, strings)).isEqualTo("Message vocal (0:12)")
        assertThat(MediaKindLabel.voiceRecording(-1.0, strings)).isEqualTo("Message vocal (0:00)")
    }

    @Test fun `passerelle depuis le type serialise`() {
        assertThat(MediaKindLabel.kindFor("image")).isEqualTo(Kind.PHOTO)
        assertThat(MediaKindLabel.kindFor("location")).isEqualTo(Kind.LOCATION)
        assertThat(MediaKindLabel.kindFor("text")).isNull()
    }

    @Test fun `lieu et pieces jointes`() {
        assertThat(MediaKindLabel.placeLabel("", strings)).isEqualTo("Position")
        assertThat(MediaKindLabel.placeTitle(null, "1 rue X", strings)).isEqualTo("1 rue X")
        assertThat(MediaKindLabel.placeTitle(null, null, strings)).isEqualTo("Position")
        assertThat(MediaKindLabel.attachmentLabel("audio", null, 12.0, strings)).isEqualTo("0:12")
        assertThat(MediaKindLabel.attachmentLabel("audio", null, null, strings)).isEqualTo("Audio")
        assertThat(MediaKindLabel.attachmentLabel("file", "a.pdf", null, strings)).isEqualTo("a.pdf")
    }
}
