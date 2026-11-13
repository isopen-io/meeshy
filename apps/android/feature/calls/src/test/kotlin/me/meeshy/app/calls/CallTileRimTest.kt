package me.meeshy.app.calls

import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.sdk.call.CallSpeakerColor
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
    fun `l'avatar de l'appel reduit prend la couleur de l'autre dans la palette des appels, celle de ses sous-titres`() {
        assertThat(CallTileRim.peerAvatar(peerUserId = "u-awa", peerName = "Awa")).isEqualTo(CallSpeakerColor.hex("u-awa"))
    }

    @Test
    fun `sans identifiant, l'appel reduit se rabat sur le nom comme cle de la meme palette, jamais sur une seconde`() {
        assertThat(CallTileRim.peerAvatar(peerUserId = "", peerName = "Awa")).isEqualTo(CallSpeakerColor.hex("Awa"))
    }

    @Test
    fun `le lisere de l'appel reduit porte la couleur de l'autre au trait fort`() {
        val hex = CallTileRim.peerAvatar(peerUserId = "u-awa", peerName = "Awa")

        assertThat(CallTileRim.reducedRim(peerUserId = "u-awa", peerName = "Awa", warning = Color.Yellow))
            .isEqualTo(CallTileRim.selfTileBorder(paused = false, rimHex = hex, warning = Color.Yellow))
        assertThat(CallTileRim.reducedRim(peerUserId = "u-awa", peerName = "Awa", warning = Color.Yellow).width)
            .isEqualTo(MeeshyBorder.strong)
    }

    @Test
    fun `le lisere a ma couleur prend l'epaisseur forte du jeton de bordure`() {
        assertThat(CallTileRim.selfTileBorder(paused = false, rimHex = "#FF0000", warning = Color.Yellow))
            .isEqualTo(BorderStroke(MeeshyBorder.strong, Color.Red))
    }

    @Test
    fun `en pause l'ambre prime sur ma couleur, et sans couleur le lisere reste blanc et fin`() {
        assertThat(CallTileRim.selfTileBorder(paused = true, rimHex = "#FF0000", warning = Color.Yellow))
            .isEqualTo(BorderStroke(MeeshyBorder.regular, Color.Yellow.copy(alpha = 0.8f)))
        assertThat(CallTileRim.selfTileBorder(paused = false, rimHex = null, warning = Color.Yellow))
            .isEqualTo(BorderStroke(1.dp, Color.White.copy(alpha = 0.3f)))
        assertThat(CallTileRim.selfTileBorder(paused = false, rimHex = "pas-une-couleur", warning = Color.Yellow))
            .isEqualTo(BorderStroke(1.dp, Color.White.copy(alpha = 0.3f)))
    }

    @Test
    fun `le visage du pair en caméra coupée prend sa couleur d'auteur, la meme que ses sous-titres`() {
        assertThat(CallTileRim.peerFace("u-awa")).isEqualTo(CallSpeakerColor.hex("u-awa"))
    }

    @Test
    fun `sans identifiant du pair, aucune couleur n'est inventee pour son visage`() {
        assertThat(CallTileRim.peerFace("")).isNull()
        assertThat(CallTileRim.peerFace("  ")).isNull()
    }
}
