package me.meeshy.app.calls

import me.meeshy.sdk.call.CallSpeakerColor

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
}
