package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import org.junit.Test

/** Loi 3 (`docs/product/appels-vue-finale.md`, vues P15 et L5) : sur un écran partagé reçu, le verre s'assombrit. */
class CallGlassToneTest {

    @Test
    fun `sur une image de camera, le verre reste clair`() {
        assertThat(CallGlassTone.of(showsReceivedScreen = false)).isEqualTo(CallGlassTone.OverPicture)
    }

    @Test
    fun `sur un ecran recu, le verre passe au sombre`() {
        assertThat(CallGlassTone.of(showsReceivedScreen = true)).isEqualTo(CallGlassTone.OverLightContent)
    }

    @Test
    fun `le voile sombre est plus dense que celui du verre ordinaire, boutons compris`() {
        assertThat(CallGlassTone.OverLightContent.veilAlpha).isGreaterThan(CallGlassTone.OverPicture.veilAlpha)
        assertThat(CallGlassTone.OverLightContent.neutralFillAlpha).isGreaterThan(CallGlassTone.OverPicture.neutralFillAlpha)
        assertThat(CallGlassTone.OverLightContent.chipScrimAlpha).isGreaterThan(CallGlassTone.OverPicture.chipScrimAlpha)
    }

    @Test
    fun `le verre ordinaire garde exactement les valeurs deja livrees`() {
        assertThat(CallGlassTone.OverPicture.veilAlpha).isEqualTo(0.2f)
        assertThat(CallGlassTone.OverPicture.chipScrimAlpha).isEqualTo(0.35f)
        assertThat(CallGlassTone.OverPicture.neutralFillAlpha).isWithin(0.005f).of(0.16f)
    }

    @Test
    fun `en groupe, l'ecran d'un membre a la une compte comme un ecran recu`() {
        assertThat(received(isGroupStage = true, groupFocus = GroupCallStageFocus.Spotlight("bob", isScreenShare = true))).isTrue()
    }

    @Test
    fun `en groupe, la grille ou la camera d'un membre a la une gardent le verre clair, meme si le pair du duo partage`() {
        assertThat(received(isGroupStage = true, duoPeerSharing = true, groupFocus = GroupCallStageFocus.Grid)).isFalse()
        assertThat(received(isGroupStage = true, groupFocus = GroupCallStageFocus.Spotlight("bob", isScreenShare = false))).isFalse()
    }

    @Test
    fun `en groupe, mon propre ecran a la une n'assombrit pas le verre`() {
        val mine = GroupCallStageFocus.Spotlight(GroupCallStageLaw.LOCAL_TILE_ID, isScreenShare = true)

        assertThat(received(isGroupStage = true, groupFocus = mine)).isFalse()
    }

    @Test
    fun `en duo, l'ecran du pair assombrit le verre`() {
        assertThat(received(isGroupStage = false, duoPeerSharing = true)).isTrue()
    }

    @Test
    fun `en duo, ma camera permutee en plein ecran garde le verre clair pendant que le pair partage`() {
        assertThat(received(isGroupStage = false, duoPeerSharing = true, duoMyImageFullScreen = true)).isFalse()
    }

    @Test
    fun `dans le bloc de la pilule, deja voile, un bouton garde le verre clair deja livre`() {
        assertThat(CallGlassTone.OverLightContent.withinVeiledBlock).isEqualTo(CallGlassTone.OverPicture)
        assertThat(CallGlassTone.OverPicture.withinVeiledBlock).isEqualTo(CallGlassTone.OverPicture)
    }

    private fun received(
        isGroupStage: Boolean,
        duoPeerSharing: Boolean = false,
        duoMyImageFullScreen: Boolean = false,
        groupFocus: GroupCallStageFocus = GroupCallStageFocus.Grid,
    ): Boolean = CallGlassTone.showsReceivedScreen(
        isGroupStage = isGroupStage,
        duoPeerSharing = duoPeerSharing,
        duoMyImageFullScreen = duoMyImageFullScreen,
        groupFocus = groupFocus,
    )
}
