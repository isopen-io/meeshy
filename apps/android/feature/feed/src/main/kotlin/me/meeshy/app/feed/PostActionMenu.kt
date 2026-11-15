package me.meeshy.app.feed

import me.meeshy.sdk.model.PendingSendMenu
import me.meeshy.sdk.model.PostMenuContext
import me.meeshy.sdk.model.PostMenuEntry
import me.meeshy.sdk.model.PostMenuPolicy

/**
 * Une action du menu d'options d'une card de post (l'overflow en haut a droite).
 * Pendant du `MessageActionMenu` du chat : une liste plate, composee purement.
 */
enum class PostAction {
    Open,
    Share,
    CopyLink,
    CopyText,
    Repost,
    Quote,
    Bookmark,
    Unbookmark,
    SaveMedia,
    Imager,
    ViewViewers,
    Pin,
    Edit,
    NearHere,
    DisableComments,
    EnableComments,
    Report,
    Delete,
    RetrySend,
    ReopenSend,
    CancelSend,
}

/** Description UI-free d'un post au moment d'ouvrir son menu d'options. */
data class PostActionContext(
    val isOwn: Boolean,
    val isBookmarked: Boolean,
    /** Le post porte du texte : sans lui, « Copier le texte » n'a rien a copier. */
    val hasText: Boolean = true,
    /** L'œuvre est composée : « Imager » a quelque chose à rendre ([PostImaging]). */
    val imageable: Boolean = false,
    /** La carte sait ouvrir son détail : « Ouvrir » ouvre le menu. */
    val canOpen: Boolean = false,
    val viewerRole: String? = null,
    val postType: String? = null,
    val hasSaveableMedia: Boolean = false,
    val editable: Boolean = false,
    val hasLocation: Boolean = false,
    /** La publication est encore sur l'appareil : son menu n'offre que ce qui vaut sans serveur (#14902). */
    val pendingSend: PendingSendMenu? = null,
    /** Les commentaires de CE post sont fermés : l'entrée offerte est « Réactiver » (#16541). */
    val commentsDisabled: Boolean = false,
    /** La surface sait fermer ou rouvrir les commentaires ; l'auteur et la modération de la plateforme le voient. */
    val canToggleComments: Boolean = false,
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
 * `onDelete`) ; la suppression ferme la liste, comme toute action destructrice. « Imager » suit
 * l'enregistrement, comme iOS (`PostSaveMenuItems`), et n'existe que pour une œuvre composée.
 */
object PostActionMenu {
    fun actions(ctx: PostActionContext): List<PostAction> = PostMenuPolicy.entries(
        PostMenuContext(
            isAuthor = ctx.isOwn,
            viewerRole = ctx.viewerRole,
            postType = ctx.postType,
            hasText = ctx.hasText,
            isBookmarked = ctx.isBookmarked,
            hasSaveableMedia = ctx.hasSaveableMedia,
            canOpen = ctx.canOpen,
            imageable = ctx.imageable,
            editable = ctx.editable,
            hasLocation = ctx.hasLocation,
            pendingSend = ctx.pendingSend,
            commentsDisabled = ctx.commentsDisabled,
            canToggleComments = ctx.canToggleComments,
        ),
    ).map(PostMenuEntry::asAction)
}

private fun PostMenuEntry.asAction(): PostAction = when (this) {
    PostMenuEntry.Open -> PostAction.Open
    PostMenuEntry.Share -> PostAction.Share
    PostMenuEntry.CopyLink -> PostAction.CopyLink
    PostMenuEntry.CopyText -> PostAction.CopyText
    PostMenuEntry.Repost -> PostAction.Repost
    PostMenuEntry.Quote -> PostAction.Quote
    PostMenuEntry.Bookmark -> PostAction.Bookmark
    PostMenuEntry.Unbookmark -> PostAction.Unbookmark
    PostMenuEntry.SaveMedia -> PostAction.SaveMedia
    PostMenuEntry.Imager -> PostAction.Imager
    PostMenuEntry.ViewViewers -> PostAction.ViewViewers
    PostMenuEntry.Pin -> PostAction.Pin
    PostMenuEntry.Edit -> PostAction.Edit
    PostMenuEntry.NearHere -> PostAction.NearHere
    PostMenuEntry.DisableComments -> PostAction.DisableComments
    PostMenuEntry.EnableComments -> PostAction.EnableComments
    PostMenuEntry.Report -> PostAction.Report
    PostMenuEntry.Delete -> PostAction.Delete
    PostMenuEntry.RetrySend -> PostAction.RetrySend
    PostMenuEntry.ReopenSend -> PostAction.ReopenSend
    PostMenuEntry.CancelSend -> PostAction.CancelSend
}
