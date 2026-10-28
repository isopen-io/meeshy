package me.meeshy.ui.component.media

import android.content.Context
import androidx.media3.common.util.UnstableApi
import me.meeshy.sdk.model.mediacache.MediaCacheCategory

/**
 * Ce qui part du cache média Media3 quand le compte change : l'AUDIO (les sons de la bibliothèque, dont les sons
 * privés de leur auteur, et les vocaux) ET la VIDÉO (pièces jointes `/api/v1/attachments/file/…`, lues avec le jeton
 * du compte). Le compte suivant ne relit jamais, depuis le disque, ce que le premier a obtenu avec son jeton.
 * Les réels publics partent aussi : ils se retéléchargent, une fuite entre comptes ne se rattrape pas
 * (decisions.md, ADR-027).
 */
public object AccountMediaWipe {
    @OptIn(UnstableApi::class)
    public fun wipe(context: Context) {
        val cache = MeeshyMediaCache.get(context)
        cache.clear(MediaCacheCategory.AUDIO)
        cache.clear(MediaCacheCategory.VIDEO)
    }
}
