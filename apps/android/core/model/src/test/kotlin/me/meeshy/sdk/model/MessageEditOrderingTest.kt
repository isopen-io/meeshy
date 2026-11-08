package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageEditOrderingTest {

    @Test
    fun `une edition plus recente passe`() {
        assertThat(MessageEditOrdering.accepts(storedMillis = 1_000, incomingMillis = 2_000)).isTrue()
    }

    @Test
    fun `une edition ancienne ne regresse pas une plus recente`() {
        assertThat(MessageEditOrdering.accepts(storedMillis = 10_000, incomingMillis = 5_000)).isFalse()
    }

    @Test
    fun `la meme date relue a une fraction pres passe - jamais un inferieur strict`() {
        assertThat(MessageEditOrdering.accepts(storedMillis = 10_000, incomingMillis = 9_999)).isTrue()
        assertThat(MessageEditOrdering.accepts(storedMillis = 10_000, incomingMillis = 9_950)).isTrue()
        assertThat(MessageEditOrdering.accepts(storedMillis = 10_000, incomingMillis = 9_949)).isFalse()
    }

    @Test
    fun `sans date stockee ou sans date servie l edition passe`() {
        assertThat(MessageEditOrdering.accepts(null, 5_000)).isTrue()
        assertThat(MessageEditOrdering.accepts(5_000, null)).isTrue()
    }

    @Test
    fun `la garde se lit sur des dates ISO`() {
        assertThat(MessageEditOrdering.acceptsIso("2026-01-01T10:00:10Z", "2026-01-01T10:00:05Z")).isFalse()
        assertThat(MessageEditOrdering.acceptsIso("2026-01-01T10:00:05Z", "2026-01-01T10:00:10Z")).isTrue()
        assertThat(MessageEditOrdering.acceptsIso("illisible", "2026-01-01T10:00:10Z")).isTrue()
    }

    @Test
    fun `une edition locale est datee juste apres une date stockee en avance`() {
        assertThat(MessageEditOrdering.localStamp(nowMillis = 1_000, storedMillis = null)).isEqualTo(1_000)
        assertThat(MessageEditOrdering.localStamp(nowMillis = 1_000, storedMillis = 500)).isEqualTo(1_000)
        assertThat(MessageEditOrdering.localStamp(nowMillis = 1_000, storedMillis = 5_000)).isEqualTo(5_001)
    }
}
