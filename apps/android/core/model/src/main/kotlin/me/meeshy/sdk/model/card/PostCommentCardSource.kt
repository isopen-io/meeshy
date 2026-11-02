package me.meeshy.sdk.model.card

/** La nature d'un média qu'une carte peut montrer. */
public enum class PostCommentCardMediaKind {
    IMAGE,
    VIDEO,
    AUDIO,
    ;

    public val isVisual: Boolean get() = this == IMAGE || this == VIDEO

    /** Ce qui écrit un commentaire sans texte : le symbole de son média. */
    public val symbol: String get() = when (this) {
        IMAGE -> "📷"
        VIDEO -> "🎬"
        AUDIO -> "🎤"
    }
}

/** Un média PEIGNABLE (l'hôte a déjà écarté les pièces masquées), dans son ordre. */
public data class PostCommentCardMedia(val id: String, val kind: PostCommentCardMediaKind)

public data class PostCommentCardAuthor(val id: String, val displayName: String? = null, val username: String? = null)

/** Un commentaire tel que la carte le lit : son texte SERVI (le Prisme, ou l'original demandé) et ses médias peignables. */
public data class PostCommentCardComment(
    val id: String,
    val parentId: String?,
    val createdAtMillis: Long,
    val author: PostCommentCardAuthor,
    val text: String,
    val effectFlags: Long = 0,
    /** Encore en vol : il n'a pas d'existence à partager. */
    val inFlight: Boolean = false,
    val media: List<PostCommentCardMedia> = emptyList(),
)

/**
 * Le support du commentaire : un post, un réel, une story ou un statut. Seule une [visibility] `PUBLIC` se fige en tête
 * d'une carte qui part hors de Meeshy ; restreinte ou inconnue, elle laisse le commentaire seul (fail-closed).
 */
public data class PostCommentCardPost(
    val type: String?,
    val visibility: String?,
    val createdAtMillis: Long,
    val author: PostCommentCardAuthor,
    val text: String,
    val media: List<PostCommentCardMedia> = emptyList(),
    /** Le post porte un canvas de story : il disparaît comme elle. */
    val hasStoryCanvas: Boolean = false,
)

public data class PostCommentCardViewer(val id: String, val displayName: String)

public data class PostCommentCardSource(
    val post: PostCommentCardPost?,
    val target: PostCommentCardComment,
    /** La racine et ses réponses chargées, dans n'importe quel ordre. */
    val thread: List<PostCommentCardComment>,
    val viewer: PostCommentCardViewer,
)

/** Les cinq compositions d'iOS, le défaut de chaque cas en tête de [PostCommentCardComposition.modes]. */
public enum class PostCommentCardMode {
    POST_AND_COMMENT,
    COMMENT_ALONE,
    THREAD_TO_HERE,
    POST_ROOT_AND_REPLY,
    CHOSEN_REPLIES,
    ;

    /** Le post est-il en tête quand on choisit ce mode ? */
    public val showsPostByDefault: Boolean get() = this == POST_AND_COMMENT || this == POST_ROOT_AND_REPLY
}

public data class PostCommentCardChoice(
    val mode: PostCommentCardMode,
    val showsPost: Boolean = mode.showsPostByDefault,
    val chosen: Set<String> = emptySet(),
    /** Le média du support en tête, par sa place dans [PostCommentCardComposition.headMedia] ; `null` : le premier visuel. */
    val headMediaIndex: Int? = null,
)

public data class PostCommentCardPart(val author: String, val text: String, val handle: String?)

public sealed interface PostCommentCardBlock {
    public data class Post(val part: PostCommentCardPart) : PostCommentCardBlock
    public data class Comment(val id: String, val part: PostCommentCardPart, val depth: Int) : PostCommentCardBlock
    public data class Folded(val count: Int, val depth: Int) : PostCommentCardBlock
}

public data class PostCommentCardMediaAuthor(val name: String, val handle: String?, val quoted: Boolean)

/** Un média posé sur la carte ; [hero] : celui du support, en tête, grand et pleine largeur. */
public data class PostCommentCardPlacedMedia(
    val media: PostCommentCardMedia,
    val author: PostCommentCardMediaAuthor,
    val hero: Boolean,
)

/** Une ligne du bloc « Fil de commentaires » : « Auteur : texte », ou le pli « +N réponses », à son niveau. */
public data class PostCommentCardThreadLine(val text: String, val level: Int)

/**
 * La carte composée (miroir de `MessageCardSubject` produit par `PostCommentCardComposition.subject` iOS) : la citation
 * (le post, ou la racine), puis la réponse — ou, au-delà de deux blocs, UN bloc titré qui porte le fil ([thread]).
 */
public data class PostCommentCardSubject(
    val quoted: PostCommentCardPart?,
    val reply: PostCommentCardPart,
    /** Les lignes du fil quand [reply] en est le bloc ; vide sinon. */
    val thread: List<PostCommentCardThreadLine>,
    val sentAtMillis: Long,
    val quotedAtMillis: Long?,
    val media: List<PostCommentCardPlacedMedia>,
)

/** Les mots que la carte écrit et que seul l'hôte connaît (le catalogue de sa langue). */
public data class PostCommentCardLabels(val thread: String, val folded: (Int) -> String)

public object PostCommentCardLimits {
    public const val MAX_POST_LINES: Int = 4
    public const val MAX_POST_CHARACTERS: Int = 280
    public const val HERO_EXCERPT_LINES: Int = 2
    public const val HERO_EXCERPT_CHARACTERS: Int = 140
    public const val MAX_BLOCKS: Int = 6
    public const val MAX_MEDIA: Int = 4
    public const val MAX_DEPTH: Int = 3
}
