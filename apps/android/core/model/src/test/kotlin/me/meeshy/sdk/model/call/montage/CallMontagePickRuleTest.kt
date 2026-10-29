package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import org.junit.Test

/**
 * Le choix du mode Montage côté Android (#13690) : la puce « Classiques » et ses treize montages, comme
 * iOS (`CallMontageModeControls`), à côté des cadres en direct qui s'appliquent d'un toucher. Un classique
 * choisi se capture même sous un cadre en direct ; toucher un cadre (ou « Aucun cadre ») rend la capture
 * au cadre en direct.
 */
class CallMontagePickRuleTest {

    private val live = CallLiveFrameRule.frames().first()

    @Test
    fun `les puces sont Classiques d'abord, puis les ambiances du cadre en direct`() {
        val chips = CallMontagePickRule.chips()

        assertThat(chips.first()).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(chips.drop(1)).isEqualTo(CallLiveFrameRule.moods().map { CallMontageMoodChip.Mood(it) })
    }

    @Test
    fun `le carrousel des Classiques porte les treize montages dans l'ordre d'iOS`() {
        assertThat(CallMontagePickRule.classics()).isEqualTo(CallMontageStyle.entries.toList())
        assertThat(CallMontagePickRule.classics()).hasSize(13)
        assertThat(CallMontagePickRule.classics().first()).isEqualTo(CallMontageStyle.SCREEN)
    }

    @Test
    fun `sans rien choisir ni cadre en direct, la capture est l'Ecran et le carrousel montre les Classiques`() {
        val pick = CallMontagePick()

        assertThat(CallMontagePickRule.choice(pick, liveFrameId = null)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))
        assertThat(CallMontagePickRule.shownChip(pick, liveFrameId = null)).isEqualTo(CallMontageMoodChip.Classics)
    }

    @Test
    fun `sans rien choisir, un cadre en direct se capture et ouvre son ambiance`() {
        val pick = CallMontagePick()

        assertThat(CallMontagePickRule.choice(pick, live.id)).isEqualTo(CallMontageChoice.Frame(live.id))
        assertThat(CallMontagePickRule.shownChip(pick, live.id)).isEqualTo(CallMontageMoodChip.Mood(live.mood))
        assertThat(CallMontagePickRule.look(pick, live.id)).isEqualTo(CallCaptureLook.Frame(live))
    }

    @Test
    fun `un classique choisi se capture, meme sous un cadre en direct`() {
        val pick = CallMontagePickRule.pickingClassic(CallMontagePick(), CallMontageStyle.POLAROID)

        assertThat(CallMontagePickRule.choice(pick, live.id)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.POLAROID))
        assertThat(CallMontagePickRule.look(pick, live.id)).isEqualTo(CallCaptureLook.Classic(CallMontageStyle.POLAROID))
        assertThat(CallMontagePickRule.shownChip(pick, live.id)).isEqualTo(CallMontageMoodChip.Classics)
    }

    @Test
    fun `toucher un cadre rend la capture au cadre en direct`() {
        val classic = CallMontagePickRule.pickingClassic(CallMontagePick(), CallMontageStyle.HEART)
        val framed = CallMontagePickRule.pickingFrame(classic)

        assertThat(CallMontagePickRule.choice(framed, live.id)).isEqualTo(CallMontageChoice.Frame(live.id))
        assertThat(CallMontagePickRule.choice(framed, liveFrameId = null)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))
    }

    @Test
    fun `revenir aux Classiques reprend le dernier classique choisi, sinon l'Ecran`() {
        val first = CallMontagePickRule.showing(CallMontagePick(), CallMontageMoodChip.Classics)
        assertThat(CallMontagePickRule.choice(first, live.id)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.SCREEN))

        val chosen = CallMontagePickRule.pickingClassic(CallMontagePick(), CallMontageStyle.NEON)
        val away = CallMontagePickRule.pickingFrame(chosen)
        val back = CallMontagePickRule.showing(away, CallMontageMoodChip.Classics)

        assertThat(CallMontagePickRule.choice(back, live.id)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.NEON))
    }

    @Test
    fun `toucher une ambiance ne fait que montrer ses cadres, sans rien appliquer ni changer la capture`() {
        val mood = CallMontageMoodChip.Mood(live.mood)
        val chosen = CallMontagePickRule.pickingClassic(CallMontagePick(), CallMontageStyle.COMIC)
        val browsing = CallMontagePickRule.showing(chosen, mood)

        assertThat(CallMontagePickRule.shownChip(browsing, liveFrameId = null)).isEqualTo(mood)
        assertThat(CallMontagePickRule.choice(browsing, liveFrameId = null)).isEqualTo(CallMontageChoice.Classic(CallMontageStyle.COMIC))
    }

    @Test
    fun `un classique est selectionne seul, un cadre seulement quand aucun classique ne le recouvre`() {
        val classic = CallMontagePickRule.pickingClassic(CallMontagePick(), CallMontageStyle.GOLD)

        assertThat(CallMontagePickRule.isSelected(classic, live.id, CallMontageChoice.Classic(CallMontageStyle.GOLD))).isTrue()
        assertThat(CallMontagePickRule.isSelected(classic, live.id, CallMontageChoice.Frame(live.id))).isFalse()
        assertThat(CallMontagePickRule.isSelected(CallMontagePick(), live.id, CallMontageChoice.Frame(live.id))).isTrue()
    }
}
