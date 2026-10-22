package me.meeshy.sdk.model

/** Ce que représente une carte de « Mes stories » : la même carte sert les deux. */
enum class MyStoryCardKind { PUBLISHED, DRAFT }

/** Un glyphe de la bande sous la vignette (port de `MyStoryGlyph`). */
enum class MyStoryGlyph(val isInteractive: Boolean = true) {
    VIEWS_AND_REACTIONS,
    REACTIONS(isInteractive = false),
    COMMENTS,
    MORE,
    PUBLISH,
}

/** D'où vient le visuel d'une carte, par ordre de repli (port de `MyStoryThumbnailResolver`). */
sealed interface MyStoryThumbnailSource {
    data class LocalCover(val path: String) : MyStoryThumbnailSource
    data class RemoteUrl(val url: String) : MyStoryThumbnailSource
    data class Background(val hex: String) : MyStoryThumbnailSource
    data object Placeholder : MyStoryThumbnailSource
}

/** État visuel de la pastille de sélection en mode suppression en masse. */
enum class MyStorySelectionIndicator { HIDDEN, UNSELECTED, SELECTED }

enum class MyStoryMoreAction { EDIT, SCHEDULE, DELETE, SHARE, VIEWERS }

/** Modèle d'une carte — publiée (onglets Publiées et Archive) ou brouillon. */
data class MyStoryCardModel(
    val id: String,
    val kind: MyStoryCardKind,
    val thumbnailUrl: String?,
    val localCoverPath: String?,
    val backgroundHex: String?,
    /** Publication pour une story, dernière modification pour un brouillon. */
    val dateEpochMillis: Long,
    /** `null` pour un brouillon : rien n'expire tant que rien n'est publié. */
    val expiresAtEpochMillis: Long?,
    /** Jamais de « 0 » décoratif : un compteur nul ou négatif est absent de la table. */
    val counts: Map<MyStoryGlyph, Int>,
    val title: String?,
) {
    val thumbnailSource: MyStoryThumbnailSource
        get() = MyStoryThumbnailResolver.resolve(localCoverPath, thumbnailUrl, backgroundHex)

    val glyphs: List<MyStoryGlyph> get() = MyStoryCardRules.glyphs(kind)

    fun isExpired(nowEpochMillis: Long): Boolean = MyStoryCardRules.isVeiled(expiresAtEpochMillis, nowEpochMillis)
}

object MyStoryThumbnailResolver {
    /** Couverture locale rendue, puis URL distante, puis couleur de fond, sinon repère neutre. */
    fun resolve(localCoverPath: String?, remoteUrl: String?, backgroundHex: String?): MyStoryThumbnailSource =
        when {
            !localCoverPath.isNullOrBlank() -> MyStoryThumbnailSource.LocalCover(localCoverPath)
            !remoteUrl.isNullOrBlank() -> MyStoryThumbnailSource.RemoteUrl(remoteUrl)
            !backgroundHex.isNullOrBlank() -> MyStoryThumbnailSource.Background(backgroundHex)
            else -> MyStoryThumbnailSource.Placeholder
        }
}

object MyStoryCardRules {

    /** Entrée d'une story publiée : les chiffres viennent de la charge servie, pas de la carte. */
    data class PublishedInput(
        val id: String,
        val thumbnailUrl: String?,
        val renderedCoverPath: String?,
        val backgroundHex: String?,
        val createdAtEpochMillis: Long,
        val expiresAtEpochMillis: Long?,
        val viewCount: Int,
        val reactionCount: Int,
        val commentCount: Int,
    )

    data class DraftInput(
        val id: String,
        val title: String?,
        val renderedCoverPath: String?,
        val legacyCoverPath: String?,
        val backgroundHex: String?,
        val updatedAtEpochMillis: Long,
    )

    fun published(input: PublishedInput): MyStoryCardModel = MyStoryCardModel(
        id = input.id,
        kind = MyStoryCardKind.PUBLISHED,
        thumbnailUrl = input.thumbnailUrl,
        localCoverPath = input.renderedCoverPath,
        backgroundHex = input.backgroundHex,
        dateEpochMillis = input.createdAtEpochMillis,
        expiresAtEpochMillis = input.expiresAtEpochMillis,
        counts = nonZeroCounts(
            MyStoryGlyph.VIEWS_AND_REACTIONS to input.viewCount,
            MyStoryGlyph.REACTIONS to input.reactionCount,
            MyStoryGlyph.COMMENTS to input.commentCount,
        ),
        title = null,
    )

    fun draft(input: DraftInput): MyStoryCardModel = MyStoryCardModel(
        id = input.id,
        kind = MyStoryCardKind.DRAFT,
        thumbnailUrl = null,
        localCoverPath = input.renderedCoverPath ?: input.legacyCoverPath,
        backgroundHex = input.backgroundHex,
        dateEpochMillis = input.updatedAtEpochMillis,
        expiresAtEpochMillis = null,
        counts = emptyMap(),
        title = input.title,
    )

    private fun nonZeroCounts(vararg pairs: Pair<MyStoryGlyph, Int>): Map<MyStoryGlyph, Int> =
        pairs.filter { it.second > 0 }.toMap()

    /** La bande basse : engagement pour une story publiée, bouton publier pour un brouillon. */
    fun glyphs(kind: MyStoryCardKind): List<MyStoryGlyph> = when (kind) {
        MyStoryCardKind.PUBLISHED ->
            listOf(MyStoryGlyph.VIEWS_AND_REACTIONS, MyStoryGlyph.REACTIONS, MyStoryGlyph.COMMENTS, MyStoryGlyph.MORE)
        MyStoryCardKind.DRAFT -> listOf(MyStoryGlyph.PUBLISH, MyStoryGlyph.MORE)
    }

    /** Une story périmée garde sa vignette sous un voile ; la bande de glyphes reste nette. */
    fun isVeiled(expiresAtEpochMillis: Long?, nowEpochMillis: Long): Boolean =
        expiresAtEpochMillis != null && expiresAtEpochMillis <= nowEpochMillis

    fun selectionIndicator(isSelecting: Boolean, isSelected: Boolean): MyStorySelectionIndicator = when {
        !isSelecting -> MyStorySelectionIndicator.HIDDEN
        isSelected -> MyStorySelectionIndicator.SELECTED
        else -> MyStorySelectionIndicator.UNSELECTED
    }

    fun showsSaveProgressRing(saveProgress: Double?): Boolean = saveProgress != null

    /** « Programmer » reste derrière [scheduling] : offrir une action inerte est pire que l'omettre. */
    fun moreActions(kind: MyStoryCardKind, scheduling: Boolean = false): List<MyStoryMoreAction> = when (kind) {
        MyStoryCardKind.PUBLISHED -> listOf(MyStoryMoreAction.VIEWERS, MyStoryMoreAction.SHARE, MyStoryMoreAction.DELETE)
        MyStoryCardKind.DRAFT -> buildList {
            add(MyStoryMoreAction.EDIT)
            if (scheduling) add(MyStoryMoreAction.SCHEDULE)
            add(MyStoryMoreAction.DELETE)
        }
    }
}
