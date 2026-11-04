package me.meeshy.sdk.media

import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Le pont `cmid` du téléversement → id serveur de la pièce** (#15969). Une pièce en attente porte le `cmid` de son
 * téléversement comme identifiant ; à l'accusé de son message, la bulle la montre sous l'id que la passerelle lui a donné.
 * Ce qui suit la pièce d'une forme à l'autre — le lecteur de vocaux qui la joue PENDANT l'accusé — lit ici que les deux
 * identifiants désignent la même pièce, quel que soit le chemin de l'accusé (réponse REST ou `message:new` arrivé avant).
 *
 * En mémoire, borné aux [CAPACITY] derniers téléversements : il ne sert qu'à l'instant de l'accusé, pas à l'histoire.
 */
@Singleton
public class UploadedAttachmentIds @Inject constructor() {
    private val serverIds = object : LinkedHashMap<String, String>(CAPACITY, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean = size > CAPACITY
    }

    /** Le téléversement [cmid] a produit la pièce serveur [serverId]. */
    public fun record(cmid: String, serverId: String) {
        if (cmid.isBlank() || serverId.isBlank() || cmid == serverId) return
        synchronized(serverIds) { serverIds[cmid] = serverId }
    }

    /** L'id serveur de la pièce téléversée sous [cmid] ; `null` tant qu'elle n'a pas atterri, ou oubliée depuis. */
    public fun serverIdOf(cmid: String): String? = synchronized(serverIds) { serverIds[cmid] }

    private companion object {
        const val CAPACITY = 256
    }
}

/** L'accès au pont depuis une vue (le lecteur de vocaux du fil), sans graphe Hilt dans les témoins. */
@EntryPoint
@InstallIn(SingletonComponent::class)
public interface UploadedAttachmentIdsEntryPoint {
    public fun uploadedAttachmentIds(): UploadedAttachmentIds
}
