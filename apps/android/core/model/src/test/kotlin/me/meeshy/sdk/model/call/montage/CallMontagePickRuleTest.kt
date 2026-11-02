package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameSpotlightRule
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import org.junit.Test

/**
 * Le choix du mode Montage côté Android (#13732), miroir de `CallCaptureController` et `CallMontageModeControls`
 * d'iOS : un cadre choisi dans le carrousel ne sert QUE la capture ; l'option « Cadre » le garde pendant l'appel ;
 * toucher une ambiance y choisit son dernier cadre ; « Plus d'ambiances » ouvre tout le catalogue.
 */
class CallMontagePickRuleTest {

    private val duo = 2
    private val live = CallLiveFrameRule.frames().first()
    private val signature = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT)

    @Test
    fun `le montage ouvre sur l'Ecran et les Classiques, les ambiances mises en avant seulement`() {
        val pick = CallMontagePick()

        assertThat(CallMontagePickRule.choice(pick, duo)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))
        assertThat(CallMontagePickRule.shownChip(pick, duo)).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(CallMontagePickRule.chips(pick, duo))
            .isEqualTo(listOf(CallMontageMoodChip.Classics) + CallFrameSpotlightRule.moods(duo, CallFrameScope.SPOTLIGHT).map { CallMontageMoodChip.Mood(it) })
        assertThat(CallMontagePickRule.items(pick, duo)).hasSize(13)
    }

    @Test
    fun `choisir un cadre ne sert que la capture, et la capture le peint`() {
        val pick = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(signature.first().id))

        assertThat(CallMontagePickRule.choice(pick, duo)).isEqualTo(CallMontageChoice.Frame(signature.first().id))
        assertThat(CallMontagePickRule.look(pick, duo)).isEqualTo(CallCaptureLook.Frame(signature.first()))
        assertThat(CallMontagePickRule.shownChip(pick, duo)).isEqualTo(CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE))
    }

    @Test
    fun `toucher une ambiance y choisit son dernier cadre, sinon son premier`() {
        val mood = CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE)
        val first = CallMontagePickRule.showing(CallMontagePick(), mood, duo)
        assertThat(CallMontagePickRule.choice(first, duo)).isEqualTo(CallMontageChoice.Frame(signature.first().id))

        val second = CallMontagePickRule.selecting(first, CallMontageChoice.Frame(signature.last().id))
        val away = CallMontagePickRule.showing(second, CallMontageMoodChip.Classics, duo)
        assertThat(CallMontagePickRule.choice(away, duo)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))

        val back = CallMontagePickRule.showing(away, mood, duo)
        assertThat(CallMontagePickRule.choice(back, duo)).isEqualTo(CallMontageChoice.Frame(signature.last().id))
    }

    @Test
    fun `revenir aux Classiques reprend le dernier classique choisi`() {
        val neon = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Classic(CallMontageStyle.NEON))
        val framed = CallMontagePickRule.showing(neon, CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE), duo)
        val back = CallMontagePickRule.showing(framed, CallMontageMoodChip.Classics, duo)

        assertThat(CallMontagePickRule.choice(back, duo)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.NEON))
    }

    @Test
    fun `le carrousel montre le cadre de base d'une declinaison choisie, et la nomme`() {
        val base = CallFrameCatalogue.frames(duo).first { it.styles.isNotEmpty() }
        val declined = CallFrameStyleRule.declinations(base.id)[1]
        val pick = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(declined.id))

        assertThat(CallMontagePickRule.selection(pick, duo)).isEqualTo(CallMontageChoice.Frame(base.id))
        assertThat(CallMontagePickRule.declined(pick, CallMontageChoice.Frame(base.id), duo)).isEqualTo(CallMontageChoice.Frame(declined.id))
        assertThat(CallMontagePickRule.items(pick, duo)).contains(CallMontageChoice.Frame(base.id))
        assertThat(CallMontageFrameRule.frameName(declined.id)).isEqualTo("${base.name} · ${base.styles.first().name}")
        assertThat(CallMontageFrameRule.frameName(base.id)).isEqualTo(base.name)
        assertThat(CallMontageFrameRule.frameName("inconnu.motif.duo")).isNull()
    }

    @Test
    fun `Plus d'ambiances ouvre tout le catalogue, Moins y revient et le choix retombe sur une vedette`() {
        val all = CallMontagePickRule.settingScope(CallMontagePick(), CallFrameScope.ALL, duo)
        assertThat(CallMontagePickRule.chips(all, duo).drop(1).map { (it as CallMontageMoodChip.Mood).mood }).isEqualTo(CallFrameCatalogue.moods(duo))
        assertThat(CallMontagePickRule.scopeToggle(all, duo)).isEqualTo(CallMontageScopeToggle(showsAll = true))

        val hidden = CallFrameCatalogue.frames(duo).first { candidate ->
            CallFrameSpotlightRule.frames(duo, candidate.mood, CallFrameScope.SPOTLIGHT).none { it.id == candidate.id }
        }
        val chosen = CallMontagePickRule.selecting(all, CallMontageChoice.Frame(hidden.id))
        val less = CallMontagePickRule.settingScope(chosen, CallFrameScope.SPOTLIGHT, duo)

        assertThat(CallMontagePickRule.scope(less, duo)).isEqualTo(CallFrameScope.SPOTLIGHT)
        assertThat(CallMontagePickRule.items(less, duo)).contains(CallMontagePickRule.choice(less, duo))
    }

    @Test
    fun `un cadre hors de la mise en avant reste visible, la portee s'elargit d'elle-meme`() {
        val hidden = CallFrameCatalogue.frames(duo).first { candidate ->
            CallFrameSpotlightRule.frames(duo, candidate.mood, CallFrameScope.SPOTLIGHT).none { it.id == candidate.id }
        }
        val pick = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(hidden.id))

        assertThat(CallMontagePickRule.scope(pick, duo)).isEqualTo(CallFrameScope.ALL)
        assertThat(CallMontagePickRule.items(pick, duo)).contains(CallMontageChoice.Frame(hidden.id))
        assertThat(CallMontagePickRule.scopeToggle(CallMontagePick(), duo)).isEqualTo(CallMontageScopeToggle(showsAll = false))
    }

    @Test
    fun `a l'ouverture, un cadre garde pendant l'appel devient le choix`() {
        assertThat(CallMontagePickRule.choice(CallMontagePickRule.opening(CallMontagePick(), live.id), duo)).isEqualTo(CallMontageChoice.Frame(live.id))
        assertThat(CallMontagePickRule.opening(CallMontagePick(), null)).isEqualTo(CallMontagePick())
    }

    @Test
    fun `Cadre ne s'offre que sur un cadre servi en direct en duo video, allume s'il est garde`() {
        val framed = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(live.id))

        assertThat(CallMontagePickRule.hold(framed, duo, heldFrameId = null, isOffered = true)).isEqualTo(CallMontageHold(live.id, isOn = false))
        assertThat(CallMontagePickRule.hold(framed, duo, heldFrameId = live.id, isOffered = true)).isEqualTo(CallMontageHold(live.id, isOn = true))
        assertThat(CallMontagePickRule.hold(framed, duo, heldFrameId = null, isOffered = false)).isNull()
        assertThat(CallMontagePickRule.hold(CallMontagePick(), duo, heldFrameId = live.id, isOffered = true)).isNull()

        val captureOnly = CallFrameCatalogue.frames(duo).firstOrNull { !CallLiveFrameRule.isEligible(it) }
        if (captureOnly != null) {
            val pick = CallMontagePickRule.selecting(CallMontagePick(), CallMontageChoice.Frame(captureOnly.id))
            assertThat(CallMontagePickRule.hold(pick, duo, heldFrameId = null, isOffered = true)).isNull()
        }
    }

    @Test
    fun `toucher Cadre garde le cadre affiche, le retoucher le retire`() {
        assertThat(CallLiveFrameRule.toggledHold(current = null, tapped = live.id)).isEqualTo(live.id)
        assertThat(CallLiveFrameRule.toggledHold(current = live.id, tapped = live.id)).isNull()
        assertThat(CallLiveFrameRule.toggledHold(current = "x.y.duo", tapped = live.id)).isEqualTo(live.id)
    }

    @Test
    fun `les vignettes de cadres se peignent autour du choisi, declinaisons comprises, jamais tout le catalogue`() {
        val classic = CallMontagePick()
        assertThat(CallMontagePickRule.frameWindow(classic, duo)).isEmpty()

        val mood = CallFrameCatalogue.frames(duo).groupBy { it.mood }.values.maxBy { it.size }
        val chosen = mood.last()
        val all = CallMontagePickRule.settingScope(CallMontagePick(), CallFrameScope.ALL, duo)
        val pick = CallMontagePickRule.selecting(all, CallMontageChoice.Frame(chosen.id))
        val window = CallMontagePickRule.frameWindow(pick, duo)
        val declinations = CallFrameStyleRule.declinations(chosen.id).drop(1)

        assertThat(mood.size).isGreaterThan(CallCapturePreviewRule.THUMBNAIL_RADIUS + 1)
        assertThat(window).isEqualTo(mood.takeLast(CallCapturePreviewRule.THUMBNAIL_RADIUS + 1) + declinations)
    }

    @Test
    fun `la scene, le cadre garde se sert lui-meme sous le mode, un cadre servi en direct se pose sur le flux, le reste se peint`() {
        val frame = CallCaptureLook.Frame(live)

        assertThat(CallMontageStageRule.stage(CallCaptureLook.Classic(CallMontageStyle.GOLD), live = live)).isEqualTo(CallMontageStage.Painted)
        assertThat(CallMontageStageRule.stage(frame, live = live)).isEqualTo(CallMontageStage.Live(live))
        assertThat(CallMontageStageRule.stage(frame, live = null)).isEqualTo(CallMontageStage.Painted)
    }
}
