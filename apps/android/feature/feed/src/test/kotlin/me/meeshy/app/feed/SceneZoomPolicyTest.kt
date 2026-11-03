package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneZoomPolicyTest {

    @Test
    fun `la galerie ouverte sur la scene zoome depuis la carte de scene du post`() {
        assertThat(SceneZoomPolicy.destinationKey("p1", hasScene = true, startMediaId = null))
            .isEqualTo(SceneZoomPolicy.sourceKey("p1"))
    }

    @Test
    fun `un media du carrousel ne zoome pas`() {
        assertThat(SceneZoomPolicy.destinationKey("p1", hasScene = true, startMediaId = "m1")).isNull()
    }

    @Test
    fun `un post sans scene ne zoome pas`() {
        assertThat(SceneZoomPolicy.destinationKey("p1", hasScene = false, startMediaId = null)).isNull()
    }

    @Test
    fun `la cle de source est prefixee pour ne pas heurter les groupes de stories`() {
        assertThat(SceneZoomPolicy.sourceKey("g1")).isNotEqualTo("g1")
        assertThat(SceneZoomPolicy.sourceKey("a")).isNotEqualTo(SceneZoomPolicy.sourceKey("b"))
    }
}
