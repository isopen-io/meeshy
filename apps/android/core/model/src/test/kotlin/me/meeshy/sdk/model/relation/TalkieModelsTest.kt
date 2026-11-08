package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Le contrat du talkie (`packages/shared/types/talkie.ts`) lu par Android (#16675). */
class TalkieModelsTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `l'annonce se lit, sans nom, et dit si son encodage est lisible`() {
        val incoming = json.decodeFromString<TalkieIncoming>(
            """{"talkieId":"t1","fromUserId":"alice","codec":"aac-adts","startedAt":"2026-11-08T05:00:00Z","maxDurationMs":30000}""",
        )
        assertThat(incoming.isPlayable).isTrue()
        assertThat(incoming.copy(codec = "opus").isPlayable).isFalse()
    }

    @Test
    fun `la fin se lit, une raison inconnue devient absente`() {
        val ended = json.decodeFromString<TalkieEnded>(
            """{"talkieId":"t1","fromUserId":"alice","toUserId":"me","reason":"cut","endedAt":"2026-11-08T05:00:10Z"}""",
        )
        assertThat(ended.servedReason).isEqualTo(TalkieEndReason.CUT)
        assertThat(ended.silencesNow).isTrue()
        assertThat(ended.copy(reason = "moonwalk").servedReason).isNull()
    }

    @Test
    fun `un fragment incomplet ne se lit pas`() {
        val data = byteArrayOf(1)
        assertThat(TalkieChunk.of("t1", "alice", 0, data)).isEqualTo(TalkieChunk("t1", "alice", 0, byteArrayOf(1)))
        assertThat(TalkieChunk.of("", "alice", 0, data)).isNull()
        assertThat(TalkieChunk.of("t1", null, 0, data)).isNull()
        assertThat(TalkieChunk.of("t1", "alice", -1, data)).isNull()
        assertThat(TalkieChunk.of("t1", "alice", 0, byteArrayOf())).isNull()
    }
}
