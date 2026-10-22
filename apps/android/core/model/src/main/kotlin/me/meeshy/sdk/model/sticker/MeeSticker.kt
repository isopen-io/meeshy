package me.meeshy.sdk.model.sticker

/** La distribution d'un film : Mee seule, Meo seul, ou les deux ensemble. */
enum class MeeCharacter { MEE, MEO, DUO }

/**
 * Ce que le sticker permet de DIRE — la section de la feuille. Les valeurs brutes sont celles du web
 * (`MEE_INTENTS`) et de l'iOS `MeeSticker.Intent`.
 */
enum class MeeIntent(val raw: String) {
    BONJOUR("bonjour"),
    AMOUR("amour"),
    FETE("fete"),
    SOUTIEN("soutien"),
    RALE("rale"),
    COUP_DE_MOU("coup-de-mou"),
    SURPRISE("surprise"),
    QUOTIDIEN("quotidien"),
    HUMOUR_NOIR("humour-noir"),
}

/**
 * Un film de Mee ou de Meo. `title` est le nom du sticker tel que le web l'écrit (celui que TalkBack dit) ;
 * `emoji` est le repli que lisent les clients qui ne savent pas jouer le film.
 */
data class MeeSticker(
    val id: String,
    val character: MeeCharacter,
    val intent: MeeIntent,
    val title: String,
    val emoji: String,
    val animated: Boolean,
) {
    val templateId: String get() = MeeStickerCatalog.templateId(id)
    val assetFileName: String get() = MeeStickerCatalog.assetFileName(id)
}
