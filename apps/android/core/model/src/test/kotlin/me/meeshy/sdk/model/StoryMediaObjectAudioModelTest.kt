package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class StoryMediaObjectAudioModelTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun decode(s: String) = json.decodeFromString(StoryMediaObject.serializer(), s)

    @Test fun `la presence de la cle aspectRatio fait la mesure meme a 1`() {
        assertThat(decode("""{"id":"m","aspectRatio":1.0}""").aspectRatio).isEqualTo(1.0)
        val legacy = decode("""{"id":"m"}""")
        assertThat(legacy.aspectRatio).isNull()
        assertThat(legacy.servedAspectRatio).isEqualTo(1.0)
    }

    @Test fun `un kind inconnu ne fait pas echouer le document`() {
        val m = decode("""{"id":"m","mediaType":"hologram"}""")
        assertThat(m.kind).isNull()
        assertThat(decode("""{"id":"m","mediaType":"video"}""").kind).isEqualTo(StoryMediaKind.VIDEO)
    }

    @Test fun `filtre inconnu se lit sans filtre et connu se type`() {
        assertThat(decode("""{"id":"m","filter":"sepia9"}""").parsedFilter).isNull()
        assertThat(decode("""{"id":"m","filter":"bw"}""").parsedFilter).isEqualTo(StoryFilter.BW)
    }

    @Test fun `un thumbHash demesure se lit absent`() {
        assertThat(StoryMediaObject(id = "m", thumbHash = "x".repeat(101)).servedThumbHash).isNull()
        assertThat(StoryMediaObject(id = "m", thumbHash = "abc").servedThumbHash).isEqualTo("abc")
    }

    @Test fun `le memento voyage et les ajustements ont les bornes iOS`() {
        val m = decode("""{"id":"m","volume":0,"mutedVolumeMemento":0.6,"adjustments":{"exposure":9,"contrast":0.1}}""")
        assertThat(m.mutedVolumeMemento).isEqualTo(0.6f)
        assertThat(m.adjustments!![AdjustmentKind.EXPOSURE]).isEqualTo(2f)
        assertThat(m.adjustments!![AdjustmentKind.CONTRAST]).isEqualTo(0.5f)
    }
}
