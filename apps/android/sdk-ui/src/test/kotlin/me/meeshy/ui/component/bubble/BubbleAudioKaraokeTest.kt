package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.TranscriptionSegment
import me.meeshy.ui.component.bubble.BubbleAudioKaraoke.Phase
import org.junit.Test

private data class KaraokePrefs(override val systemLanguage: String?) : LanguageResolver.ContentLanguagePreferences {
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}

private fun timed(text: String, start: Double, end: Double) = MessageTranscriptionSegment(text = text, startTime = start, endTime = end)

private val words = listOf(timed("bonjour", 0.0, 1.0), timed("tout", 1.0, 2.0), timed("le", 2.5, 3.0), timed("monde", 3.0, 4.0))

private fun playing(seconds: Double, progress: Float = 0f) = BubbleAudioPlayback(
    attachmentId = "a1",
    isPlaying = true,
    isLoading = false,
    progress = progress,
    timeLabel = "",
    currentSeconds = seconds,
)

private fun audioOf(attachment: ApiMessageAttachment, systemLanguage: String = "fr"): BubbleAudio =
    BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "", attachments = listOf(attachment)),
        currentUserId = "me",
        preferences = KaraokePrefs(systemLanguage),
    ).audios.single()

class BubbleAudioKaraokeTest {

    @Test
    fun `nothing is lit while the voice note is not the one being played`() {
        assertThat(BubbleAudioKaraoke.frame(words, playback = null).phases).containsExactly(Phase.Rest, Phase.Rest, Phase.Rest, Phase.Rest)
    }

    @Test
    fun `a paused voice note lights nothing, as iOS at rest`() {
        val paused = playing(1.5).copy(isPlaying = false)

        assertThat(BubbleAudioKaraoke.frame(words, paused).activeIndex).isNull()
        assertThat(BubbleAudioKaraoke.frame(words, paused).phases).containsExactly(Phase.Rest, Phase.Rest, Phase.Rest, Phase.Rest)
    }

    @Test
    fun `the segment under the playback position is lit, those before it are past, those after ahead`() {
        val frame = BubbleAudioKaraoke.frame(words, playing(1.5))

        assertThat(frame.activeIndex).isEqualTo(1)
        assertThat(frame.phases).containsExactly(Phase.Past, Phase.Active, Phase.Ahead, Phase.Ahead).inOrder()
    }

    @Test
    fun `a silence between two words keeps what was said past and lights nothing`() {
        val frame = BubbleAudioKaraoke.frame(words, playing(2.2))

        assertThat(frame.activeIndex).isNull()
        assertThat(frame.phases).containsExactly(Phase.Past, Phase.Past, Phase.Ahead, Phase.Ahead).inOrder()
    }

    @Test
    fun `untimed segments advance with the progress of the playback`() {
        val untimed = listOf("a", "b", "c", "d").map { MessageTranscriptionSegment(text = it) }

        val frame = BubbleAudioKaraoke.frame(untimed, playing(0.0, progress = 0.6f))

        assertThat(frame.phases).containsExactly(Phase.Past, Phase.Past, Phase.Active, Phase.Ahead).inOrder()
    }

    @Test
    fun `two ticks inside the same word give equal frames, so the transcript is not redrawn`() {
        assertThat(BubbleAudioKaraoke.frame(words, playing(1.1))).isEqualTo(BubbleAudioKaraoke.frame(words, playing(1.9)))
        assertThat(BubbleAudioKaraoke.frame(words, playing(1.9))).isNotEqualTo(BubbleAudioKaraoke.frame(words, playing(2.9)))
    }

    @Test
    fun `the transcript reads the segments one after the other and styles each by its phase`() {
        val palette = BubbleAudioKaraoke.Palette.of(Color.White)
        val text = BubbleAudioKaraoke.text(words, BubbleAudioKaraoke.frame(words, playing(1.5)), palette)

        assertThat(text.text).isEqualTo("bonjour tout le monde")
        val active = text.spanStyles.single { it.item.fontWeight == FontWeight.Bold }
        assertThat(text.text.substring(active.start, active.end)).isEqualTo("tout")
        val past = text.spanStyles.single { it.item.color == palette.past.color }
        assertThat(text.text.substring(past.start, past.end)).isEqualTo("bonjour")
    }

    @Test
    fun `a touch on a word seeks to its start, a touch between two words to the word before`() {
        assertThat(BubbleAudioKaraoke.seekSecondsAt(words, offset = 9)).isEqualTo(1.0)
        assertThat(BubbleAudioKaraoke.seekSecondsAt(words, offset = 7)).isEqualTo(0.0)
        assertThat(BubbleAudioKaraoke.seekSecondsAt(words, offset = 16)).isEqualTo(3.0)
    }

    @Test
    fun `untimed segments offer no seek, a touch then plays or pauses`() {
        val untimed = listOf("a", "b").map { MessageTranscriptionSegment(text = it) }

        assertThat(BubbleAudioKaraoke.seekSecondsAt(untimed, offset = 2)).isNull()
        assertThat(BubbleAudioKaraoke.isSeekable(untimed)).isFalse()
        assertThat(BubbleAudioKaraoke.isSeekable(words)).isTrue()
    }

    @Test
    fun `a bubble without segments karaokes its transcription as one block`() {
        val audio = BubbleAudio(attachmentId = "a1", transcriptionText = " bonjour tout le monde ")

        assertThat(audio.karaokeSegments).containsExactly(MessageTranscriptionSegment(text = "bonjour tout le monde"))
        assertThat(BubbleAudio(attachmentId = "a1").karaokeSegments).isEmpty()
    }

    @Test
    fun `the original voice carries the timed segments of the original transcription`() {
        val audio = audioOf(
            ApiMessageAttachment(
                id = "a1",
                mimeType = "audio/mp4",
                fileUrl = "/media/voice.m4a",
                transcription = ApiAttachmentTranscription(
                    text = "bonjour le monde",
                    language = "fr",
                    segments = listOf(
                        TranscriptionSegment(text = " bonjour", startTime = 0.0, endTime = 0.8, speakerId = "s1"),
                        TranscriptionSegment(text = "  ", startTime = 0.8, endTime = 0.9),
                        TranscriptionSegment(text = "le monde", startTime = 0.9, endTime = 1.6),
                    ),
                ),
            ),
        )

        assertThat(audio.karaokeSegments).containsExactly(
            MessageTranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 0.8, speakerId = "s1"),
            MessageTranscriptionSegment(text = "le monde", startTime = 0.9, endTime = 1.6),
        ).inOrder()
    }

    @Test
    fun `a translated voice carries the timed segments of its own track`() {
        val audio = audioOf(
            ApiMessageAttachment(
                id = "a1",
                mimeType = "audio/mp4",
                fileUrl = "/media/voice.m4a",
                transcription = ApiAttachmentTranscription(
                    text = "hello world",
                    language = "en",
                    segments = listOf(TranscriptionSegment(text = "hello world", startTime = 0.0, endTime = 1.0)),
                ),
                translations = mapOf(
                    "fr" to ApiAttachmentTranslation(
                        url = "/media/fr.ogg",
                        transcription = "bonjour le monde",
                        segments = listOf(
                            TranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 0.7),
                            TranscriptionSegment(text = "le monde", startTime = 0.7, endTime = 1.4),
                        ),
                    ),
                ),
            ),
        )

        assertThat(audio.isAudioTranslated).isTrue()
        assertThat(audio.karaokeSegments.map { it.text }).containsExactly("bonjour", "le monde").inOrder()
        assertThat(audio.karaokeSegments.map { it.endTime }).containsExactly(0.7, 1.4).inOrder()
    }

    @Test
    fun `a translated text over the original voice keeps its words but not their timing, which belongs to another track`() {
        val audio = audioOf(
            ApiMessageAttachment(
                id = "a1",
                mimeType = "audio/mp4",
                fileUrl = "/media/voice.m4a",
                transcription = ApiAttachmentTranscription(text = "hello world", language = "en"),
                translations = mapOf(
                    "fr" to ApiAttachmentTranslation(
                        transcription = "bonjour le monde",
                        segments = listOf(
                            TranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 0.7),
                            TranscriptionSegment(text = "le monde", startTime = 0.7, endTime = 1.4),
                        ),
                    ),
                ),
            ),
        )

        assertThat(audio.isAudioTranslated).isFalse()
        assertThat(audio.transcriptionText).isEqualTo("bonjour le monde")
        assertThat(audio.karaokeSegments).containsExactly(
            MessageTranscriptionSegment(text = "bonjour"),
            MessageTranscriptionSegment(text = "le monde"),
        ).inOrder()
    }
}
