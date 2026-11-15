package me.meeshy.sdk.model.sticker

/**
 * Le rangement de la palette — miroir de `StickerTemplateFamily` (iOS, #4716, #4820) : les vingt familles du catalogue,
 * dans l'ordre de la palette. Ce n'est pas une famille d'objet de scène : une décoration reste un sticker qui porte un
 * gabarit. [TEXT] est la seule dont un emplacement est de la PROSE (les mots de l'auteur).
 */
enum class StickerTemplateFamily {
    LOCATION, TIME, LOVE, WEATHER, TEXT, JOY, SURPRISE, MOOD, GREETING, REACTION,
    PARTY, AVAILABILITY, NATURE, CHEER, ANSWER, FOOD, SPORT, TRAVEL, WORK, MUSIC,
}
