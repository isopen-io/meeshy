package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K35 — la loi des barres, la loi du glissement et la recette du lecteur d'onde. */
class MeeshyWavePlayerTest {

    private fun resolve(
        size: MeeshyWavePlayerSize = MeeshyWavePlayerSize.Row,
        phase: MeeshyWavePlayerPhase = MeeshyWavePlayerPhase.Ready,
        isPlaying: Boolean = false,
        progress: Double = 0.0,
        isScrubbing: Boolean = false,
        isEnabled: Boolean = true,
        reduceMotion: Boolean = false,
    ) = MeeshyWavePlayerRecipe.resolve(size, phase, isPlaying, progress, isScrubbing, isEnabled, reduceMotion)

    @Test
    fun `une barre tous les 6 dp au plus et une au moins`() {
        assertThat(MeeshyWaveBarsLaw.barCount(80f)).isEqualTo(13)
        assertThat(MeeshyWaveBarsLaw.barCount(300f)).isEqualTo(50)
        assertThat(MeeshyWaveBarsLaw.barCount(5f)).isEqualTo(1)
        assertThat(MeeshyWaveBarsLaw.barCount(Float.NaN)).isEqualTo(1)
    }

    @Test
    fun `sans niveaux les barres sont plates - jamais une onde inventee`() {
        assertThat(MeeshyWaveBarsLaw.resample(emptyList(), 80f)).isEqualTo(List(13) { 0.0 })
    }

    @Test
    fun `trop de niveaux pour les barres - la moyenne du paquet`() {
        val bars = MeeshyWaveBarsLaw.resample(listOf(0f, 1f, 0f, 1f), 12f)
        assertThat(bars).hasSize(2)
        assertThat(bars[0]).isWithin(1e-9).of(0.5)
        assertThat(bars[1]).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `un niveau hors 0 a 1 ou non fini est ramene`() {
        assertThat(MeeshyWaveBarsLaw.resample(listOf(5f), 6f)).containsExactly(1.0)
        assertThat(MeeshyWaveBarsLaw.resample(listOf(-1f), 6f)).containsExactly(0.0)
        assertThat(MeeshyWaveBarsLaw.resample(listOf(Float.NaN), 6f)).containsExactly(0.0)
    }

    @Test
    fun `jamais de barre sous 3 de haut et une courbe qui releve les passages calmes`() {
        assertThat(MeeshyWaveBarsLaw.height(0.0, 40f)).isEqualTo(3f)
        assertThat(MeeshyWaveBarsLaw.height(Double.NaN, 40f)).isEqualTo(3f)
        assertThat(MeeshyWaveBarsLaw.height(1.0, 40f)).isEqualTo(40f)
        assertThat(MeeshyWaveBarsLaw.height(0.25, 40f)).isWithin(1e-4f).of(20f)
    }

    @Test
    fun `une barre est jouee quand son centre est atteint - le nombre ne depend que de progress`() {
        assertThat(MeeshyWaveBarsLaw.filledBars(50, 0.0)).isEqualTo(0)
        assertThat(MeeshyWaveBarsLaw.filledBars(50, 1.0)).isEqualTo(50)
        assertThat(MeeshyWaveBarsLaw.filledBars(50, 0.5)).isEqualTo(25)
        assertThat(MeeshyWaveBarsLaw.filledBars(10, 0.34)).isEqualTo(3)
        assertThat(MeeshyWaveBarsLaw.filledBars(10, -2.0)).isEqualTo(0)
        assertThat(MeeshyWaveBarsLaw.filledBars(10, 9.0)).isEqualTo(10)
        assertThat(MeeshyWaveBarsLaw.filledBars(0, 0.5)).isEqualTo(0)
    }

    @Test
    fun `pendant un glissement l'onde suit le doigt`() {
        assertThat(MeeshyWaveBarsLaw.displayedProgress(0.2, scrubFraction = 0.8)).isEqualTo(0.8)
        assertThat(MeeshyWaveBarsLaw.displayedProgress(0.2, scrubFraction = null)).isEqualTo(0.2)
        assertThat(MeeshyWaveBarsLaw.displayedProgress(7.0, scrubFraction = null)).isEqualTo(1.0)
    }

    @Test
    fun `la fraction visee est bornee et reflechie de droite a gauche`() {
        assertThat(MeeshyWaveBarsLaw.scrubFraction(-20f, 200f, isRtl = false)).isEqualTo(0.0)
        assertThat(MeeshyWaveBarsLaw.scrubFraction(50f, 200f, isRtl = false)).isEqualTo(0.25)
        assertThat(MeeshyWaveBarsLaw.scrubFraction(50f, 200f, isRtl = true)).isEqualTo(0.75)
        assertThat(MeeshyWaveBarsLaw.scrubFraction(900f, 200f, isRtl = false)).isEqualTo(1.0)
        assertThat(MeeshyWaveBarsLaw.scrubFraction(10f, 0f, isRtl = false)).isEqualTo(0.0)
    }

    @Test
    fun `le glissement commence au premier mouvement et remet sa fraction au relacher`() {
        val first = MeeshyWaveScrubLaw().move(0.3)
        assertThat(first.began).isTrue()
        assertThat(first.law.fraction).isEqualTo(0.3)
        assertThat(first.law.move(0.6).began).isFalse()
        val done = first.law.finish(at = 0.7, accepts = true)
        assertThat(done.commit).isEqualTo(0.7)
        assertThat(done.ended).isTrue()
        assertThat(done.law.fraction).isNull()
    }

    @Test
    fun `le glissement se ferme toujours meme quand le lecteur n'accepte plus le geste`() {
        val moving = MeeshyWaveScrubLaw().move(0.3).law
        val done = moving.finish(at = 0.9, accepts = false)
        assertThat(done.commit).isNull()
        assertThat(done.ended).isTrue()
        assertThat(done.law.fraction).isNull()
    }

    @Test
    fun `un geste annule ferme le glissement sans rien remettre`() {
        val cancelled = MeeshyWaveScrubLaw().move(0.3).law.cancel()
        assertThat(cancelled.ended).isTrue()
        assertThat(cancelled.law.fraction).isNull()
        assertThat(MeeshyWaveScrubLaw().cancel().ended).isFalse()
        assertThat(MeeshyWaveScrubLaw().finish(0.5, true).ended).isFalse()
    }

    @Test
    fun `deux tailles - rangee 60 et 40 de haut d'onde, compacte 44 et 28`() {
        val row = resolve(size = MeeshyWavePlayerSize.Row)
        assertThat(listOf(row.discDiameterDp, row.glyphSizeDp, row.waveHeightDp, row.rowHeightDp, row.gapDp))
            .containsExactly(60f, 22f, 40f, 60f, 14f).inOrder()
        val compact = resolve(size = MeeshyWavePlayerSize.Compact)
        assertThat(listOf(compact.discDiameterDp, compact.glyphSizeDp, compact.waveHeightDp, compact.rowHeightDp, compact.gapDp))
            .containsExactly(44f, 18f, 28f, 44f, 10f).inOrder()
        assertThat(row.scrubZoneHeightDp).isEqualTo(44f)
    }

    @Test
    fun `sept etats lisibles qui se deduisent de la phase et des valeurs`() {
        assertThat(resolve().phaseState).isEqualTo(MeeshyWavePlayerState.Rest)
        assertThat(resolve(isPlaying = true, progress = 0.4).phaseState).isEqualTo(MeeshyWavePlayerState.Playing)
        assertThat(resolve(progress = 0.4).phaseState).isEqualTo(MeeshyWavePlayerState.Paused)
        assertThat(resolve(progress = 1.0).phaseState).isEqualTo(MeeshyWavePlayerState.Finished)
        assertThat(resolve(isScrubbing = true, isPlaying = true).phaseState).isEqualTo(MeeshyWavePlayerState.Scrubbing)
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Buffering).phaseState).isEqualTo(MeeshyWavePlayerState.Buffering)
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Unavailable).phaseState).isEqualTo(MeeshyWavePlayerState.Unavailable)
    }

    @Test
    fun `le glyphe du disque suit l'etat - pause en lecture, rejouer a la fin`() {
        assertThat(resolve().glyph).isEqualTo(MeeshyWavePlayerGlyph.Play)
        assertThat(resolve(isPlaying = true, progress = 0.4).glyph).isEqualTo(MeeshyWavePlayerGlyph.Pause)
        assertThat(resolve(progress = 0.4).glyph).isEqualTo(MeeshyWavePlayerGlyph.Play)
        assertThat(resolve(progress = 1.0).glyph).isEqualTo(MeeshyWavePlayerGlyph.Replay)
    }

    @Test
    fun `l'anneau n'existe qu'au chargement et seul un lecteur pret recoit un geste`() {
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Buffering).showsRing).isTrue()
        assertThat(resolve().showsRing).isFalse()
        assertThat(resolve().acceptsToggle).isTrue()
        assertThat(resolve().acceptsScrub).isTrue()
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Buffering).acceptsToggle).isFalse()
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Unavailable).acceptsScrub).isFalse()
        assertThat(resolve(isEnabled = false).acceptsToggle).isFalse()
    }

    @Test
    fun `les barres vivent seulement en lecture et jamais en mouvement reduit`() {
        assertThat(resolve(isPlaying = true).barsAreLive).isTrue()
        assertThat(resolve(isPlaying = true, reduceMotion = true).barsAreLive).isFalse()
        assertThat(resolve().barsAreLive).isFalse()
    }

    @Test
    fun `indisponible ou desactive - 40 pour cent, presse 0,94, glisse 1,12, a venir 30 pour cent`() {
        assertThat(resolve(phase = MeeshyWavePlayerPhase.Unavailable).opacity).isEqualTo(0.4f)
        assertThat(resolve(isEnabled = false).opacity).isEqualTo(0.4f)
        assertThat(resolve().opacity).isEqualTo(1f)
        val v = resolve()
        assertThat(v.pressedScale).isEqualTo(0.94f)
        assertThat(v.scrubScale).isEqualTo(1.12f)
        assertThat(v.upcomingOpacity).isEqualTo(0.3f)
    }

    @Test
    fun `la duree - temps restant en lecture, total au repos, tirets sans duree`() {
        fun clock(d: Double, p: Double, playing: Boolean, mode: MeeshyWavePlayerClock) = MeeshyWavePlayerRecipe.clockText(d, p, playing, mode)
        assertThat(clock(9.0, 0.5, true, MeeshyWavePlayerClock.Remaining)).isEqualTo("0:05")
        assertThat(clock(9.0, 0.5, false, MeeshyWavePlayerClock.Remaining)).isEqualTo("0:09")
        assertThat(clock(9.0, 0.5, true, MeeshyWavePlayerClock.Elapsed)).isEqualTo("0:05")
        assertThat(clock(9.0, 0.5, true, MeeshyWavePlayerClock.Total)).isEqualTo("0:09")
        assertThat(clock(125.0, 0.0, false, MeeshyWavePlayerClock.Total)).isEqualTo("2:05")
        assertThat(clock(0.0, 0.5, true, MeeshyWavePlayerClock.Remaining)).isEqualTo("–:––")
        assertThat(clock(Double.NaN, 0.5, true, MeeshyWavePlayerClock.Remaining)).isEqualTo("–:––")
    }
}
