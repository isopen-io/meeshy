package me.meeshy.sdk.model

/**
 * QUI peut ouvrir la liste des vues d'une publication (iOS `PublicationViewersAccess`, #9727) :
 * l'auteur d'une story ou d'un statut ; ADMIN et BIGBOSS pour tout contenu. L'auteur d'un post
 * ou d'un réel n'en voit que le NOMBRE. Ne décide que de ce qu'on MONTRE : la passerelle reste
 * l'autorité (403).
 */
object PublicationViewersAccess {
    private val authorListedTypes = setOf("STORY", "STATUS")

    fun isAdministrator(role: String?): Boolean =
        UserRole.from(role).let { it == UserRole.ADMIN || it == UserRole.BIGBOSS }

    fun mayList(postType: String?, isAuthor: Boolean, viewerRole: String?): Boolean =
        (isAuthor && postType.orEmpty().uppercase() in authorListedTypes) || isAdministrator(viewerRole)
}
