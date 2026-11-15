package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoSoundSessionTest {
    @Test
    fun `le reel joue avec son par defaut`() {
        assertThat(VideoSoundSession().soundOn.value).isTrue()
    }

    @Test
    fun `le bouton haut-parleur bascule le son de la session`() {
        val session = VideoSoundSession()
        session.toggle()
        assertThat(session.soundOn.value).isFalse()
        session.toggle()
        assertThat(session.soundOn.value).isTrue()
    }

    @Test
    fun `la preference est conservee et relue par la session suivante`() {
        val store = VideoSoundSession.Store.InMemory()
        VideoSoundSession(store).set(false)
        assertThat(VideoSoundSession(store).soundOn.value).isFalse()
    }
}
