package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
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
        assertThat(CallGlassTone.showsReceivedScreen(isGroupStage = true, duoPeerSharing = false, groupScreenAtTheFront = true)).isTrue()
        assertThat(CallGlassTone.showsReceivedScreen(isGroupStage = true, duoPeerSharing = true, groupScreenAtTheFront = false)).isFalse()
        assertThat(CallGlassTone.showsReceivedScreen(isGroupStage = false, duoPeerSharing = true, groupScreenAtTheFront = false)).isTrue()
    }
}
