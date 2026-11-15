package me.meeshy.app.calls

import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.hexColor

private const val NEUTRAL_RIM_ALPHA = 0.3f
private const val PAUSED_RIM_ALPHA = 0.8f

/**
 * Le liseré d'une vignette d'appel porte la couleur de la personne qu'elle MONTRE (`docs/product/appels-vue-finale.md`
 * loi 4, vue P1) : la mienne comprise, la même que celle de ses sous-titres et de son anneau. Une seule source,
 * [CallSpeakerColor] ; un identifiant inconnu ne fabrique aucune couleur (`null` : l'hôte garde son liseré neutre).
 */
internal object CallTileRim {

    /** La vignette flottante du duo : moi, ou l'autre une fois les deux vidéos permutées ([showsPeer]). */
    fun duoSelfTile(selfUserId: String, peerUserId: String, showsPeer: Boolean): String? =
        (if (showsPeer) peerUserId else selfUserId).takeIf { it.isNotBlank() }?.let(CallSpeakerColor::hex)

    /** Une vignette de la grille de groupe, « moi » compris : sa clé de couleur est l'identifiant du membre. */
    fun groupTile(colorKey: String): String = CallSpeakerColor.hex(colorKey)

    /** Le visage du pair caméra coupée (G4.2) : sa couleur d'auteur, celle de ses sous-titres ; `null` sans identifiant (la marque reste). */
    fun peerFace(peerUserId: String): String? = peerUserId.takeIf { it.isNotBlank() }?.let(CallSpeakerColor::hex)

    /**
     * Le fond d'avatar du pair hors de l'écran d'appel (l'appel réduit) : sa couleur d'AUTEUR, la même que celle de ses
     * sous-titres (P18.4, loi 4) — [CallSpeakerColor] est l'unique palette des appels. L'identifiant prime ; sans lui, le
     * nom sert de clé à la MÊME palette (jamais à une seconde).
     */
    fun peerAvatar(peerUserId: String, peerName: String): String = CallSpeakerColor.hex(peerUserId.ifBlank { peerName })

    /** Le liseré de l'appel réduit (P18.4) : la couleur de l'autre au trait fort, par le même dessin que la vignette du duo. */
    fun reducedRim(peerUserId: String, peerName: String, warning: Color): BorderStroke =
        selfTileBorder(paused = false, rimHex = peerAvatar(peerUserId, peerName), warning = warning)

    /**
     * Le trait de la vignette du duo (P1 : `border: 2px var(--moi)`) : l'ambre de la pause prime, puis la couleur de qui
     * elle montre au trait fort ; sans couleur lisible, le liseré blanc et fin déjà livré.
     */
    fun selfTileBorder(paused: Boolean, rimHex: String?, warning: Color): BorderStroke {
        val rim = rimHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified }
        return when {
            paused -> BorderStroke(MeeshyBorder.regular, warning.copy(alpha = PAUSED_RIM_ALPHA))
            rim != null -> BorderStroke(MeeshyBorder.strong, rim)
            else -> BorderStroke(MeeshyBorder.regular, Color.White.copy(alpha = NEUTRAL_RIM_ALPHA))
        }
    }
}
