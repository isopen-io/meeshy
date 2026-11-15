package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPresentation
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChatMediaHostTest {

    private class Fixture {
        var dismissals = 0
        val host = ChatMediaHost { dismissals++ }
    }

    private val image = MediaPresentation.Image("m1", 0)
    private val video = MediaPresentation.Video("https://x/v.mp4", secure = false)

    @Test
    fun `ouvrir une image puis une video ne laisse que la video et ferme la visionneuse`() {
        val f = Fixture()
        f.host.open(image)
        f.host.open(video)
        assertThat(f.host.active).isEqualTo(video)
        assertThat(f.dismissals).isEqualTo(1)
    }

    @Test
    fun `le retour ferme la presentation active`() {
        val f = Fixture()
        f.host.open(video)
        f.host.close()
        assertThat(f.host.active).isNull()
        assertThat(f.dismissals).isEqualTo(0)
    }

    @Test
    fun `fermer une image ferme aussi la visionneuse du ViewModel`() {
        val f = Fixture()
        f.host.open(image)
        f.host.close()
        assertThat(f.host.active).isNull()
        assertThat(f.dismissals).isEqualTo(1)
    }

    @Test
    fun `une visionneuse deja fermee ne declenche pas de seconde fermeture`() {
        val f = Fixture()
        f.host.open(image)
        f.host.onImageViewerClosed()
        assertThat(f.host.active).isNull()
        assertThat(f.dismissals).isEqualTo(0)
    }
}
