package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedReelVisibilityTest {

    @Test
    fun `un cadre se publie par pas de 8 dp`() {
        assertThat(FeedReelVisibility.quantizedPx(803f, 2f)).isEqualTo(800f)
        assertThat(FeedReelVisibility.quantizedPx(809f, 2f)).isEqualTo(816f)
        assertThat(FeedReelVisibility.quantizedPx(800f, 2f)).isEqualTo(800f)
    }

    @Test
    fun `deux mesures dans le meme pas donnent le meme cadre`() {
        val a = FeedReelVisibility.reported("r", FeedReelKind.SCENE, 100f, 500f, 2f)
        val b = FeedReelVisibility.reported("r", FeedReelKind.SCENE, 103f, 503f, 2f)
        assertThat(a.midY).isEqualTo(b.midY)
        assertThat(a.height).isEqualTo(400f)
    }

    @Test
    fun `un offset n est relaye que s il change`() {
        val relay = FeedChangeRelay(0f)
        assertThat(relay.relay(0f)).isFalse()
        assertThat(relay.relay(12f)).isTrue()
        assertThat(relay.relay(12f)).isFalse()
        assertThat(relay.value).isEqualTo(12f)
    }
}
