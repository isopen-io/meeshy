package me.meeshy.app.feed

/**
 * Une action du menu d'options d'une card de post (l'overflow en haut a droite).
 * Pendant du `MessageActionMenu` du chat : une liste plate, composee purement.
 */
enum class PostAction {
    Share,
    CopyLink,
    Repost,
    Quote,
    Bookmark,
    Unbookmark,
    Pin,
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
 * Regles : partager/copier/reposter/citer valent pour tout post (citer = un
 * repost accompagne d'un commentaire) ; le signalement ne
 * vise que le contenu D'AUTRUI ; l'epinglage et la suppression ne visent que
 * le SIEN — port fidele d'iOS (`ProfileUserPostsList.swift`/
 * `PostDetailViewModel.swift`, `onPin` gate sur `isOwnPost` exactement comme
 * `onDelete`) ; la suppression ferme la liste, comme toute action destructrice.
 */
object PostActionMenu {
    fun actions(ctx: PostActionContext): List<PostAction> = buildList {
        add(PostAction.Share)
        add(PostAction.CopyLink)
        add(PostAction.Repost)
        add(PostAction.Quote)
        add(if (ctx.isBookmarked) PostAction.Unbookmark else PostAction.Bookmark)
        if (!ctx.isOwn) {
            add(PostAction.Report)
        }
        if (ctx.isOwn) {
            add(PostAction.Pin)
            add(PostAction.Delete)
        }
    }
}
