package me.meeshy.app.composer.inbound

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La porte d'entrée des médias reçus d'une autre app (partage entrant, collage) vers le composeur (#13527).
 *
 * Chaque URI est du contenu NON FIABLE : sa source est jugée AVANT toute lecture ([InboundMediaPolicy.admitsSource] —
 * `content://` d'une autre app, accordé par l'expéditeur lui-même), ses octets sont copiés, bornés et typés par eux-mêmes ([InboundMediaReader]), vers
 * le cache privé ([ComposerSeedStore]) : plus aucune URI de l'expéditeur n'est gardée. Un permis de
 * lecture refusé (`SecurityException`) ou une source illisible est un refus, jamais un plantage. Rien n'est téléversé ni
 * publié ici : le retrait des métadonnées (`OutgoingMediaSanitizer`) a lieu à l'envoi, et la publication est le geste de l'auteur.
 */
@Singleton
class InboundShareIntake @Inject constructor(
    @ApplicationContext private val context: Context,
    private val store: ComposerSeedStore,
) {
    /** Dépose ce que [uris] donne d'admissible et rend le jeton de la graine, ou `null` quand rien n'est admissible. */
    suspend fun stash(uris: List<Uri>, declaredMime: String?, grantedBySender: Boolean): String? = withContext(Dispatchers.IO) {
        val sources = uris.take(ComposerSeedStore.MAX_ITEMS).filter { admitsSource(it, grantedBySender) }.map { uri ->
            val declared = runCatching { context.contentResolver.getType(uri) }.getOrNull() ?: declaredMime
            InboundSource(open = { context.contentResolver.openInputStream(uri) }, declaredMime = declared)
        }
        store.stash(sources)
    }

    /** La source seule, sans lecture : l'activité de partage s'en sert pour ne pas offrir ce qu'elle refuserait. */
    fun admitsSource(uri: Uri, grantedBySender: Boolean): Boolean =
        InboundMediaPolicy.admitsSource(uri.scheme, uri.authority, context.packageName, grantedBySender)
}
