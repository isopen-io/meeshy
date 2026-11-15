package me.meeshy.app.stories

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Le média dont la scène montre l'ORIGINAL pendant l'appui maintenu sur « Comparer » (iOS `ComposerLookComparison`). Une
 * PROJECTION, jamais une écriture : le modèle n'est pas touché, donc ni l'historique ni le brouillon ne voient la comparaison,
 * et relâcher rend exactement ce qui était là. Un relâchement tardif d'un autre média n'efface pas la comparaison en cours.
 */
@Stable
internal class LookComparison {
    var mediaId: String? by mutableStateOf(null)
        private set

    fun hold(id: String) {
        mediaId = id
    }

    fun release(id: String) {
        if (mediaId == id) mediaId = null
    }
}
