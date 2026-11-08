package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

/** Loi 4 (`docs/product/appels-vue-finale.md`, vue P1) : le liseré d'une vignette porte la couleur de qui elle montre. */
class CallTileRimTest {

    @Test
    fun `ma vignette du duo porte MA couleur, celle de mes sous-titres`() {
        val rim = CallTileRim.duoSelfTile(selfUserId = "u-me", peerUserId = "u-awa", showsPeer = false)

        assertThat(rim).isEqualTo(CallSpeakerColor.hex("u-me"))
    }

    @Test
    fun `apres permutation, la vignette montre l'autre et prend SA couleur`() {
        val rim = CallTileRim.duoSelfTile(selfUserId = "u-me", peerUserId = "u-awa", showsPeer = true)

        assertThat(rim).isEqualTo(CallSpeakerColor.hex("u-awa"))
    }

    @Test
    fun `une vignette de groupe prend la couleur de la fonction partagee, jamais une seconde palette`() {
        assertThat(CallTileRim.groupTile("u-karim")).isEqualTo(CallSpeakerColor.hex("u-karim"))
    }

    @Test
    fun `sans identifiant connu, aucune couleur n'est inventee`() {
        assertThat(CallTileRim.duoSelfTile(selfUserId = "", peerUserId = "u-awa", showsPeer = false)).isNull()
        assertThat(CallTileRim.duoSelfTile(selfUserId = "u-me", peerUserId = " ", showsPeer = true)).isNull()
    }

    @Test
    fun `l'avatar de l'appel reduit se teinte par l'identifiant du pair, le nom n'etant qu'un repli`() {
        assertThat(CallTileRim.peerAvatar(peerUserId = "u-awa", peerName = "Awa")).isEqualTo(DynamicColorGenerator.colorForName("u-awa"))
        assertThat(CallTileRim.peerAvatar(peerUserId = "", peerName = "Awa")).isEqualTo(DynamicColorGenerator.colorForName("Awa"))
    }
}
