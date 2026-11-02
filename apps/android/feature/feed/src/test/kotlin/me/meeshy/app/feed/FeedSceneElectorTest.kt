package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13663 — une SEULE scène est active dans le fil : la plus visible. Les autres sont une image fixe. */
class FeedSceneElectorTest {

    private val top = 0f
    private val bottom = 1600f

    private fun frame(id: String, from: Float, height: Float = 500f) = FeedSceneFrame(id, from, from + height)

    private fun elect(vararg frames: FeedSceneFrame, incumbent: String? = null, callActive: Boolean = false) =
        FeedSceneElector.elect(frames.toList(), top, bottom, incumbent, callActive)

    @Test
    fun `la scene la plus proche du centre du fil gagne`() {
        val winner = elect(frame("a", 100f), frame("b", 550f), frame("c", 1100f))
        assertThat(winner).isEqualTo("b")
    }

    @Test
    fun `une scene a moitie cachee n est pas elue et rien ne joue hors ecran`() {
        assertThat(elect(frame("a", -300f))).isNull()
        assertThat(elect(frame("a", 1500f))).isNull()
        assertThat(elect(frame("a", 2000f), frame("b", -900f))).isNull()
        assertThat(elect()).isNull()
    }

    @Test
    fun `une scene plus haute que l ecran est elue quand elle le remplit`() {
        assertThat(elect(frame("tall", -100f, height = 2400f))).isEqualTo("tall")
    }

    @Test
    fun `l elue garde la lecture tant qu un rival n est pas nettement plus centre`() {
        val first = elect(frame("a", 300f), frame("b", 900f))
        assertThat(first).isEqualTo("a")
        val barelyCloser = elect(frame("a", 290f), frame("b", 640f), incumbent = "a")
        assertThat(barelyCloser).isEqualTo("a")
        val clearlyCloser = elect(frame("a", -100f), frame("b", 450f), incumbent = "a")
        assertThat(clearlyCloser).isEqualTo("b")
    }

    @Test
    fun `l elue sortante garde sa place jusqu a ce qu elle soit trop cachee`() {
        assertThat(elect(frame("a", -300f), incumbent = "a")).isEqualTo("a")
        assertThat(elect(frame("a", -300f), incumbent = null)).isNull()
        assertThat(elect(frame("a", -400f), incumbent = "a")).isNull()
    }

    @Test
    fun `un appel en cours ne laisse aucune scene active`() {
        assertThat(elect(frame("a", 500f), callActive = true)).isNull()
    }

    @Test
    fun `un cadre sans hauteur est ignore`() {
        assertThat(elect(FeedSceneFrame("flat", 800f, 800f), frame("b", 100f))).isEqualTo("b")
    }
}
