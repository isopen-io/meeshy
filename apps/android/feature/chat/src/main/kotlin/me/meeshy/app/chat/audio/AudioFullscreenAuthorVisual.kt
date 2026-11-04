package me.meeshy.app.chat.audio

import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.fullscreen.AudioAuthorRing
import me.meeshy.ui.component.audio.AudioFullscreenSource
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * **La décoration de profil de l'auteur sur chaque page du plein écran audio du fil.** Un vocal cité n'embarque que le
 * nom de son auteur : sa page reprend le contour que le fil a DÉJÀ servi pour ce même auteur (une bulle voisine), jamais
 * celui d'un autre et jamais un contour fabriqué. La carte ne lit que ce que le fil porte déjà.
 */
internal object AudioFullscreenAuthorVisual {

    fun ringsByAuthor(thread: List<BubbleContent>): Map<String, ServedProfileDecorItem> =
        thread.mapNotNull { bubble ->
            val ring = bubble.senderRing ?: return@mapNotNull null
            val id = (bubble.senderProfile?.userId ?: bubble.senderId)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            id to ring
        }.toMap()

    fun withRings(sources: List<AudioFullscreenSource>, thread: List<BubbleContent>): List<AudioFullscreenSource> {
        val known = ringsByAuthor(thread)
        return sources.map { source ->
            val ring = AudioAuthorRing.elect(source.author.userId, source.authorRing, known)
            if (ring == source.authorRing) source else source.copy(authorRing = ring)
        }
    }
}
