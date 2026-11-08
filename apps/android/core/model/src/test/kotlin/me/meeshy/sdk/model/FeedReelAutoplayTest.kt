package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedReelAutoplayTest {

    private fun frame(id: String, midY: Float, height: Float = 400f, kind: FeedReelKind = FeedReelKind.VIDEO) =
        FeedReelFrame(id, midY, height, kind)

    @Test
    fun `le reel le plus proche du centre est elu`() {
        val frames = listOf(frame("a", 300f), frame("b", 780f), frame("c", 1300f))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isEqualTo("b")
    }

    @Test
    fun `a egalite de distance la premiere du fil garde la main`() {
        val frames = listOf(frame("a", 600f), frame("b", 1000f))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isEqualTo("a")
    }

    @Test
    fun `une surface a moins de moitie visible ne concourt pas`() {
        val frames = listOf(frame("a", -150f))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isNull()
    }

    @Test
    fun `une surface a moitie visible pile concourt`() {
        val frames = listOf(frame("a", 0f))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isEqualTo("a")
    }

    @Test
    fun `hors viewport et sans hauteur personne n est elu`() {
        val frames = listOf(frame("a", 5000f), frame("flat", 800f, height = 0f))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isNull()
        assertThat(FeedReelAutoplay.mostCentered(emptyList(), 0f, 1600f)).isNull()
        assertThat(FeedReelAutoplay.mostCentered(listOf(frame("a", 100f)), 100f, 100f)).isNull()
    }

    @Test
    fun `une scene concourt comme une video et la plus centree gagne`() {
        val frames = listOf(frame("video", 500f), frame("scene", 790f, kind = FeedReelKind.SCENE))
        assertThat(FeedReelAutoplay.mostCentered(frames, 0f, 1600f)).isEqualTo("scene")
    }

    @Test
    fun `une scene plus haute que l ecran peut etre elue`() {
        val tall = frame("tall", 800f, height = 3000f, kind = FeedReelKind.SCENE)
        assertThat(FeedReelAutoplay.mostCentered(listOf(tall), 0f, 1600f)).isEqualTo("tall")
    }

    @Test
    fun `le prechauffage est la surface suivante sous l active`() {
        val frames = listOf(frame("a", 300f), frame("b", 780f), frame("c", 1300f), frame("d", 1800f))
        assertThat(FeedReelAutoplay.prewarmAfter("b", frames)).isEqualTo("c")
        assertThat(FeedReelAutoplay.prewarmAfter("d", frames)).isNull()
        assertThat(FeedReelAutoplay.prewarmAfter(null, frames)).isNull()
        assertThat(FeedReelAutoplay.prewarmAfter("absent", frames)).isNull()
    }

    @Test
    fun `seule une carte qui possede ET montre le moteur le rend`() {
        assertThat(FeedReelAutoplay.shouldRelinquish(ownsEngine = true, isShowingThis = true)).isTrue()
        assertThat(FeedReelAutoplay.shouldRelinquish(ownsEngine = false, isShowingThis = true)).isFalse()
        assertThat(FeedReelAutoplay.shouldRelinquish(ownsEngine = true, isShowingThis = false)).isFalse()
    }

    @Test
    fun `le moteur n est a la carte que s il joue son media`() {
        assertThat(FeedReelAutoplay.isEngineOwned(true, true, "u", "u")).isTrue()
        assertThat(FeedReelAutoplay.isEngineOwned(true, true, "other", "u")).isFalse()
        assertThat(FeedReelAutoplay.isEngineOwned(true, false, "u", "u")).isFalse()
        assertThat(FeedReelAutoplay.isEngineOwned(false, true, "u", "u")).isFalse()
    }

    @Test
    fun `un appel interdit la lecture meme pour la carte elue et prete`() {
        assertThat(FeedReelAutoplay.mayPlay(isActive = true, isReady = true, isCallActive = false)).isTrue()
        assertThat(FeedReelAutoplay.mayPlay(isActive = true, isReady = true, isCallActive = true)).isFalse()
        assertThat(FeedReelAutoplay.mayPlay(isActive = true, isReady = false, isCallActive = false)).isFalse()
    }

    @Test
    fun `le bouton son exige active, moteur et piste audio`() {
        assertThat(FeedReelAutoplay.showsSoundButton(true, true, true)).isTrue()
        assertThat(FeedReelAutoplay.showsSoundButton(false, true, true)).isFalse()
        assertThat(FeedReelAutoplay.showsSoundButton(true, false, true)).isFalse()
        assertThat(FeedReelAutoplay.showsSoundButton(true, true, false)).isFalse()
        assertThat(FeedReelAutoplay.isForceMuted(soundOn = false)).isTrue()
        assertThat(FeedReelAutoplay.isForceMuted(soundOn = true)).isFalse()
    }
}
