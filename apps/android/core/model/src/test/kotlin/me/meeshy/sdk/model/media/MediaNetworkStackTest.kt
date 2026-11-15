package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14613 — quelle pile HTTP lit un média réseau. Le client des médias quand il est installé ; sinon la pile intégrée
 * de Media3, qui lit NUE (aucune identité : elle n'a ni épinglage ni frontière de session, et suivrait une redirection
 * avec ses en-têtes), et ce repli se SIGNALE au lieu de passer en silence.
 */
class MediaNetworkStackTest {

    @Test
    fun `le client des medias installe lit le reseau, sans signalement`() {
        val stack = MediaNetworkStack.of(mediaClientInstalled = true)

        assertThat(stack).isEqualTo(MediaNetworkStack.MEDIA_CLIENT)
        assertThat(stack.reported).isFalse()
    }

    @Test
    fun `sans client installe la pile integree lit sans identite et le repli se signale`() {
        val stack = MediaNetworkStack.of(mediaClientInstalled = false)

        assertThat(stack).isEqualTo(MediaNetworkStack.BUILT_IN_UNSIGNED)
        assertThat(stack.reported).isTrue()
    }
}
