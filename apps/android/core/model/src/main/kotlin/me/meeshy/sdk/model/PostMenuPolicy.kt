package me.meeshy.sdk.model

/** Une entrée du menu « ⋯ » d'une carte de publication (iOS `FeedPostCard+Header`, menu de l'en-tête). */
enum class PostMenuEntry {
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

/** Une publication encore sur l'appareil, que le serveur n'a pas confirmée : ce que son auteur peut en faire à la main. */
data class PendingSendMenu(val canRetry: Boolean, val canReopen: Boolean)

/** Ce que la politique sait de la publication et du lecteur au moment d'ouvrir le menu. */
data class PostMenuContext(
    val isAuthor: Boolean,
    val viewerRole: String? = null,
    /** `POST`, `REEL`, `STORY`, `STATUS` — insensible à la casse ; absent = un post ordinaire. */
    val postType: String? = null,
    val hasText: Boolean = true,
    val isBookmarked: Boolean = false,
    /** Le contenu porte un média enregistrable : « Enregistrer le média » prend la place du simple favori. */
    val hasSaveableMedia: Boolean = false,
    /** La surface hôte sait ouvrir le détail (une carte du fil, pas le détail lui-même). */
    val canOpen: Boolean = false,
    /** L'œuvre est composée : « Imager » a quelque chose à rendre. */
    val imageable: Boolean = false,
    /** La surface hôte sait rouvrir le composeur sur ce contenu. */
    val editable: Boolean = false,
    /** Le post est posé quelque part : « Voir près d'ici » a un point de départ. */
    val hasLocation: Boolean = false,
    /** La publication est encore dans la file d'envoi (#14902) ; `null` pour une publication en ligne. */
    val pendingSend: PendingSendMenu? = null,
    /** Les commentaires de CE post sont fermés : l'entrée offerte est « Réactiver », sinon « Désactiver » (#16541). */
    val commentsDisabled: Boolean = false,
    /** La surface hôte sait fermer ou rouvrir les commentaires ; sans elle, l'entrée n'existe pas. */
    val canToggleComments: Boolean = false,
)

/**
 * Composition pure du menu d'une carte — source unique de « quelle entrée, dans quel ordre ». L'écran n'en est
 * qu'un rendu. Règles (iOS `FeedPostCard+Header`) : partager, copier, reposter, citer et enregistrer valent pour
 * tout contenu ; épingler, modifier et supprimer ne visent que le SIEN ; signaler ne vise que le contenu D'AUTRUI
 * et vient avant la suppression dans l'ordre, jamais avant une action ordinaire ; la liste des vues n'est offerte
 * qu'à ADMIN/BIGBOSS ([PublicationViewersAccess]) ; une story ou un statut ne se modifie ni ne s'épingle. Fermer ou
 * rouvrir les commentaires s'offre à l'auteur et à la modération de la plateforme ([PostCommentSettings]), avant le
 * signalement et la suppression.
 */
object PostMenuPolicy {
    private val ephemeralTypes = setOf("STORY", "STATUS")

    fun entries(ctx: PostMenuContext): List<PostMenuEntry> =
        ctx.pendingSend?.let { pendingEntries(ctx, it) } ?: onlineEntries(ctx)

    /**
     * Une publication en attente n'existe pas encore côté serveur (#14902, iOS #14879) : sa carte offre ouvrir, copier,
     * réessayer et rouvrir quand elle a abandonné, puis annuler l'envoi ; son détail n'offre que l'annulation.
     */
    private fun pendingEntries(ctx: PostMenuContext, pending: PendingSendMenu): List<PostMenuEntry> = buildList {
        if (ctx.canOpen) {
            add(PostMenuEntry.Open)
            if (ctx.hasText) add(PostMenuEntry.CopyText)
            if (pending.canRetry) add(PostMenuEntry.RetrySend)
            if (pending.canReopen) add(PostMenuEntry.ReopenSend)
        }
        add(PostMenuEntry.CancelSend)
    }

    private fun onlineEntries(ctx: PostMenuContext): List<PostMenuEntry> = buildList {
        val ephemeral = ctx.postType.orEmpty().uppercase() in ephemeralTypes
        if (ctx.canOpen) add(PostMenuEntry.Open)
        add(PostMenuEntry.Share)
        add(PostMenuEntry.CopyLink)
        if (ctx.hasText) add(PostMenuEntry.CopyText)
        add(PostMenuEntry.Repost)
        add(PostMenuEntry.Quote)
        add(if (ctx.isBookmarked) PostMenuEntry.Unbookmark else PostMenuEntry.Bookmark)
        if (ctx.hasSaveableMedia) add(PostMenuEntry.SaveMedia)
        if (ctx.imageable) add(PostMenuEntry.Imager)
        if (PublicationViewersAccess.isAdministrator(ctx.viewerRole)) add(PostMenuEntry.ViewViewers)
        if (ctx.isAuthor && !ephemeral) add(PostMenuEntry.Pin)
        if (ctx.isAuthor && ctx.editable && !ephemeral) add(PostMenuEntry.Edit)
        if (ctx.hasLocation) add(PostMenuEntry.NearHere)
        if (ctx.canToggleComments && PostCommentSettings.mayToggle(ctx.isAuthor, ctx.viewerRole)) {
            add(if (ctx.commentsDisabled) PostMenuEntry.EnableComments else PostMenuEntry.DisableComments)
        }
        if (!ctx.isAuthor) add(PostMenuEntry.Report)
        if (ctx.isAuthor) add(PostMenuEntry.Delete)
    }
}
