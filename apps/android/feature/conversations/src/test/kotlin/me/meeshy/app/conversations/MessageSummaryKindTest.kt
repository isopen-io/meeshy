package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaKindLabel.Kind
import me.meeshy.sdk.model.media.MediaKindStrings
import org.junit.Test

class MessageSummaryKindTest {
    private val strings = object : MediaKindStrings {
        override fun name(kind: Kind) = "n:$kind"
        override fun summary(kind: Kind) = "s:$kind"
        override val voiceMessage = "v"
        override fun voiceRecording(formattedDuration: String) = "r:$formattedDuration"
    }

    private val base = LastMessagePreviewLabels(
        photo = "", video = "", voice = "", file = "", location = "", none = "-",
        you = "Vous", senderFormat = "%1\$s : %2\$s", draftPrefix = "D ",
    )

    @Test
    fun `l'apercu de liste passe par MediaKindLabel`() {
        val labels = base.withMediaKinds(strings)
        assertThat(labels.photo).isEqualTo("s:PHOTO")
        assertThat(labels.video).isEqualTo("s:VIDEO")
        assertThat(labels.voice).isEqualTo("s:AUDIO")
        assertThat(labels.file).isEqualTo("s:FILE")
        assertThat(labels.location).isEqualTo("s:LOCATION")
    }

    @Test
    fun `les autres libelles sont conserves`() {
        val labels = base.withMediaKinds(strings)
        assertThat(labels.none).isEqualTo("-")
        assertThat(labels.you).isEqualTo("Vous")
    }
}
