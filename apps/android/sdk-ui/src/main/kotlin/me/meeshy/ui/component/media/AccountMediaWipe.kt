package me.meeshy.ui.component.media

import android.content.Context
import androidx.media3.common.util.UnstableApi
import me.meeshy.sdk.model.mediacache.MediaCacheCategory

/**
 * Ce qui part du cache média quand le compte change : l'AUDIO, seule catégorie lue avec l'identité du compte
 * ([MediaRequestHeaders] — les sons de la bibliothèque, dont les sons privés de leur auteur) et qui porte aussi les
 * vocaux du compte quitté. Le compte suivant ne relit jamais, depuis le disque, ce que le premier a obtenu avec son jeton.
 */
public object AccountMediaWipe {
    @OptIn(UnstableApi::class)
    public fun wipe(context: Context) {
        MeeshyMediaCache.get(context).clear(MediaCacheCategory.AUDIO)
    }
}
