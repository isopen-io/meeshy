package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameSurface
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import org.junit.Test

/** Portage de `ComposerLookStripRuleTests.swift` (#9351, #9566) : la bande combine, et le centre choisit. */
class ComposerLookStripRuleTest {

    private fun classic(style: CallMontageStyle) = ComposerPhotoFrame.Montage(CallMontageChoice.Classic(style))
    private fun frameItem(style: CallMontageStyle) = ComposerLookStripItem.Frame(classic(style))

    @Test
    fun `les filtres commencent par Naturel et portent chaque prereglage de l appel`() {
        val filters = ComposerLookStripRule.items(ComposerLookFamily.FILTERS)
        assertThat(filters.first()).isEqualTo(ComposerLookStripItem.Filter(VideoFilterPreset.Natural))
        assertThat(filters).hasSize(VideoFilterPreset.entries.size)
    }

    @Test
    fun `les cadres - Aucun une seule fois en tete, puis les classiques puis le catalogue, sans doublon`() {
        val frames = ComposerLookStripRule.items(ComposerLookFamily.FRAMES)
        assertThat(frames.first()).isEqualTo(ComposerLookStripItem.Frame(ComposerPhotoFrame.None))
        assertThat(frames).contains(frameItem(CallMontageStyle.POLAROID))
        assertThat(frames.toSet()).hasSize(frames.size)
        assertThat(frames.count { it == ComposerLookStripItem.Frame(ComposerPhotoFrame.None) }).isEqualTo(1)
        val classics = CallMontageStyle.entries.map { frameItem(it) }
        assertThat(frames.subList(1, 1 + classics.size)).isEqualTo(classics)
    }

    @Test
    fun `seuls les cadres du catalogue qui servent un duo en direct s offrent`() {
        val offered = ComposerLookStripRule.items(ComposerLookFamily.FRAMES)
            .mapNotNull { ((it as ComposerLookStripItem.Frame).frame as? ComposerPhotoFrame.Montage)?.choice as? CallMontageChoice.Frame }
        assertThat(offered).isNotEmpty()
        offered.forEach { choice ->
            val design = CallFrameCatalogue.frame(choice.id)!!
            assertThat(design.serves(2)).isTrue()
            assertThat(design.isOffered(CallFrameSurface.LIVE)).isTrue()
        }
    }

    @Test
    fun `une famille d effets sans autre effet qu Aucun ne s offre pas`() {
        assertThat(ComposerLookStripRule.families(effects = emptyList()))
            .containsExactly(ComposerLookFamily.FILTERS, ComposerLookFamily.FRAMES).inOrder()
        assertThat(ComposerLookStripRule.families(effects = listOf(CallFaceEffect.VOLCANO)))
            .containsExactly(ComposerLookFamily.FILTERS, ComposerLookFamily.EFFECTS, ComposerLookFamily.FRAMES).inOrder()
        assertThat(ComposerLookStripRule.items(ComposerLookFamily.EFFECTS, effects = listOf(CallFaceEffect.VOLCANO)))
            .containsExactly(ComposerLookStripItem.Effect(CallFaceEffect.NONE), ComposerLookStripItem.Effect(CallFaceEffect.VOLCANO)).inOrder()
    }

    @Test
    fun `choisir un filtre garde le cadre, choisir un cadre garde le filtre`() {
        val current = ComposerPhotoLook(filter = VideoFilterPreset.Warm, frame = classic(CallMontageStyle.NOIR))
        assertThat(ComposerLookStripRule.look(ComposerLookStripItem.Filter(VideoFilterPreset.Cool), current))
            .isEqualTo(ComposerPhotoLook(filter = VideoFilterPreset.Cool, frame = classic(CallMontageStyle.NOIR)))
        assertThat(ComposerLookStripRule.look(ComposerLookStripItem.Frame(ComposerPhotoFrame.None), current))
            .isEqualTo(ComposerPhotoLook(filter = VideoFilterPreset.Warm, frame = ComposerPhotoFrame.None))
        assertThat(ComposerLookStripRule.look(ComposerLookStripItem.Effect(CallFaceEffect.VOLCANO), current).frame)
            .isEqualTo(classic(CallMontageStyle.NOIR))
    }

    @Test
    fun `la case choisie est la moitie choisie du look, et Aucun est encadre par defaut`() {
        val current = ComposerPhotoLook(filter = VideoFilterPreset.Cool, frame = classic(CallMontageStyle.POLAROID))
        assertThat(ComposerLookStripRule.isChosen(ComposerLookStripItem.Filter(VideoFilterPreset.Cool), current)).isTrue()
        assertThat(ComposerLookStripRule.isChosen(frameItem(CallMontageStyle.POLAROID), current)).isTrue()
        assertThat(ComposerLookStripRule.isChosen(ComposerLookStripItem.Filter(VideoFilterPreset.Natural), current)).isFalse()
        val filters = ComposerLookStripRule.items(ComposerLookFamily.FILTERS)
        val frames = ComposerLookStripRule.items(ComposerLookFamily.FRAMES)
        assertThat(ComposerLookStripRule.chosenIndex(filters, current)).isEqualTo(filters.indexOf(ComposerLookStripItem.Filter(VideoFilterPreset.Cool)))
        assertThat(ComposerLookStripRule.chosenIndex(frames, current)).isEqualTo(frames.indexOf(frameItem(CallMontageStyle.POLAROID)))
        assertThat(ComposerLookStripRule.chosenIndex(frames, ComposerPhotoLook())).isEqualTo(0)
    }

    @Test
    fun `la case au centre est celle sous le milieu de la bande, les rebonds restent aux bords`() {
        val pitch = ComposerLookStripRule.PITCH
        assertThat(ComposerLookStripRule.centeredIndex(0.0, 40)).isEqualTo(0)
        assertThat(ComposerLookStripRule.centeredIndex(pitch * 3, 40)).isEqualTo(3)
        assertThat(ComposerLookStripRule.centeredIndex(pitch * 3.49, 40)).isEqualTo(3)
        assertThat(ComposerLookStripRule.centeredIndex(pitch * 3.51, 40)).isEqualTo(4)
        assertThat(ComposerLookStripRule.centeredIndex(-80.0, 40)).isEqualTo(0)
        assertThat(ComposerLookStripRule.centeredIndex(pitch * 90, 40)).isEqualTo(39)
        assertThat(ComposerLookStripRule.centeredIndex(0.0, 0)).isNull()
    }

    @Test
    fun `le defilement choisit la case centree, une seule fois et seulement si le look peut changer`() {
        var follow = ComposerLookStripFollow().begin(chosen = 0)
        follow.centeredOn(0, chosen = 0, selects = true).let { follow = it.follow; assertThat(it.decision).isNull() }
        follow.centeredOn(1, chosen = 0, selects = true).let { follow = it.follow; assertThat(it.decision).isEqualTo(1) }
        follow.centeredOn(1, chosen = 1, selects = true).let { follow = it.follow; assertThat(it.decision).isNull() }
        assertThat(follow.centeredOn(2, chosen = 1, selects = false).decision).isNull()
    }

    @Test
    fun `une bande ouverte sur une case choisie ne choisit pas la premiere, puis suit le doigt`() {
        var follow = ComposerLookStripFollow().begin(chosen = 5)
        listOf(0, 3, 5).forEach { index ->
            follow.centeredOn(index, chosen = 5, selects = true).let { follow = it.follow; assertThat(it.decision).isNull() }
        }
        assertThat(follow.centeredOn(6, chosen = 5, selects = true).decision).isEqualTo(6)
    }

    @Test
    fun `une case touchee rejoint le centre sans choisir les cases traversees`() {
        var follow = ComposerLookStripFollow().begin(chosen = 0).centeredOn(0, chosen = 0, selects = true).follow
        follow.chose(4).let { follow = it.follow; assertThat(it.decision).isEqualTo(4) }
        listOf(1, 3, 4).forEach { index ->
            follow.centeredOn(index, chosen = 4, selects = true).let { follow = it.follow; assertThat(it.decision).isNull() }
        }
        assertThat(follow.chose(4).decision).isNull()
    }

    @Test
    fun `un defilement programme coupe par le doigt choisit la ou la bande s arrete`() {
        var follow = ComposerLookStripFollow().begin(chosen = 0).centeredOn(0, chosen = 0, selects = true).follow
        follow = follow.chose(9).follow
        follow = follow.centeredOn(2, chosen = 9, selects = true).follow
        follow.settled(chosen = 9, selects = true).let { follow = it.follow; assertThat(it.decision).isEqualTo(ComposerLookStripFollow.Rest.Choose(2)) }
        follow.settled(chosen = 2, selects = true).let { follow = it.follow; assertThat(it.decision).isEqualTo(ComposerLookStripFollow.Rest.Stay) }
        assertThat(follow.centeredOn(3, chosen = 2, selects = true).decision).isEqualTo(3)
    }

    @Test
    fun `une bande qui n a jamais quitte la tete rejoint sa case au lieu d effacer le look`() {
        var follow = ComposerLookStripFollow().begin(chosen = 5).centeredOn(0, chosen = 5, selects = true).follow
        follow.settled(chosen = 5, selects = true).let { follow = it.follow; assertThat(it.decision).isEqualTo(ComposerLookStripFollow.Rest.Rejoin(5)) }
        follow = follow.centeredOn(5, chosen = 5, selects = true).follow
        assertThat(follow.settled(chosen = 5, selects = true).decision).isEqualTo(ComposerLookStripFollow.Rest.Stay)
    }

    @Test
    fun `au repos sur la case choisie, ou look fige, rien ne change`() {
        var follow = ComposerLookStripFollow().begin(chosen = 0).centeredOn(0, chosen = 0, selects = true).follow
        follow.settled(chosen = 0, selects = true).let { follow = it.follow; assertThat(it.decision).isEqualTo(ComposerLookStripFollow.Rest.Stay) }
        follow = follow.centeredOn(2, chosen = 0, selects = false).follow
        assertThat(follow.settled(chosen = 0, selects = false).decision).isEqualTo(ComposerLookStripFollow.Rest.Stay)
    }

    @Test
    fun `un look intouche part tel quel, et sans cadre il garde filtre et effet`() {
        assertThat(ComposerPhotoLook().isUntouched).isTrue()
        assertThat(ComposerPhotoLook(frame = classic(CallMontageStyle.SCREEN)).isUntouched).isFalse()
        val look = ComposerPhotoLook(VideoFilterPreset.Vivid, classic(CallMontageStyle.GRID), CallFaceEffect.VOLCANO)
        assertThat(look.withoutFrame).isEqualTo(ComposerPhotoLook(VideoFilterPreset.Vivid, ComposerPhotoFrame.None, CallFaceEffect.VOLCANO))
    }

    @Test
    fun `la puce d Aucun cadre est celle des classiques`() {
        assertThat(ComposerPhotoLookRule.chip(ComposerPhotoFrame.None)).isEqualTo(CallMontageMoodChip.Classics)
        assertThat(ComposerPhotoLookRule.frames(CallMontageMoodChip.Classics).first()).isEqualTo(ComposerPhotoFrame.None)
        assertThat(ComposerLiveLookRule.design(classic(CallMontageStyle.SCREEN))).isNull()
    }
}
