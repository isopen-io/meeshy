package me.meeshy.app.feed

/**
 * Une action du menu d'options d'une card de post (l'overflow en haut a droite).
 * Pendant du `MessageActionMenu` du chat : une liste plate, composee purement.
 */
enum class PostAction {
    Share,
    CopyLink,
    Repost,
    Bookmark,
    Unbookmark,
    Report,
    Delete,
}

/** Description UI-free d'un post au moment d'ouvrir son menu d'options. */
data class PostActionContext(
    val isOwn: Boolean,
    val isBookmarked: Boolean,
)

/**
 * Composition pure du menu d'options d'un post — source de verite unique de
 * « quelle action, dans quel ordre ». La card n'est qu'un rendu de cette liste.
 *
 * Regles : partager/copier/reposter valent pour tout post ; le signalement ne
 * vise que le contenu D'AUTRUI ; la suppression ne vise que le SIEN — et ferme
 * la liste, comme toute action destructrice.
 */
object PostActionMenu {
    fun actions(ctx: PostActionContext): List<PostAction> = buildList {
        add(PostAction.Share)
        add(PostAction.CopyLink)
        add(PostAction.Repost)
        add(if (ctx.isBookmarked) PostAction.Unbookmark else PostAction.Bookmark)
        if (!ctx.isOwn) {
            add(PostAction.Report)
        }
        if (ctx.isOwn) {
            add(PostAction.Delete)
        }
    }
}
