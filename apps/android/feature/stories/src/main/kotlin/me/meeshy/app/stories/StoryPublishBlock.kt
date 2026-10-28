package me.meeshy.app.stories

/**
 * Pourquoi une publication est bloquée par un plafond (#13590) : l'auteur LIT la raison, un bouton grisé seul ne
 * dit rien. L'ordre est celui dans lequel la raison se corrige le plus naturellement : le texte d'abord.
 */
internal enum class StoryPublishBlock { CAPTION_TOO_LONG, TEXT_TOO_LONG, TOO_MANY_TEXTS, TOO_MANY_STICKERS, TOO_MANY_MEDIA, TOO_MANY_SOUNDS, DURATION_TOO_LONG }

/**
 * La première raison de blocage d'un deck. [isRepost] : une republication recopie le texte STOCKÉ de sa source, que
 * la passerelle ne mesure pas — la longueur d'un texte ne la bloque donc jamais.
 */
internal fun StorySlideDeck.publishBlock(captionMaxChars: Int, isRepost: Boolean): StoryPublishBlock? = when {
    !isWithinTextLimit(captionMaxChars) -> StoryPublishBlock.CAPTION_TOO_LONG
    !isRepost && !isWithinElementTextLimit() -> StoryPublishBlock.TEXT_TOO_LONG
    !isWithinTextElementLimit() -> StoryPublishBlock.TOO_MANY_TEXTS
    !isWithinStickerLimit() -> StoryPublishBlock.TOO_MANY_STICKERS
    !isWithinMediaLimit() -> StoryPublishBlock.TOO_MANY_MEDIA
    !isWithinSoundLimit() -> StoryPublishBlock.TOO_MANY_SOUNDS
    !isWithinTotalDuration() -> StoryPublishBlock.DURATION_TOO_LONG
    else -> null
}
