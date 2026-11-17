package me.meeshy.sdk.model.contentcard

import me.meeshy.sdk.model.deeplink.ContentLinkTarget

/**
 * Le lien de contenu que le TEXTE d'un post déplie en carte (#19331, contrat § 5.2) : le premier qui n'est pas le post
 * lui-même (un post qui se cite ne montre pas sa propre carte) ; aucun quand une vidéo intégrée tient déjà la place sous
 * le texte (la façade YouTube passe avant). Un lien suivi qui se résoudrait vers le post lui-même est écarté à
 * l'affichage, une fois sa cible connue.
 */
object PostTextContentLink {
    fun target(urls: List<String>, embedsVideo: Boolean, postId: String): ContentLinkTarget? {
        if (embedsVideo) return null
        return urls.asSequence()
            .mapNotNull(ContentLinkTarget::of)
            .firstOrNull { target -> !(target is ContentLinkTarget.Content && target.postId.equals(postId, ignoreCase = true)) }
    }
}
