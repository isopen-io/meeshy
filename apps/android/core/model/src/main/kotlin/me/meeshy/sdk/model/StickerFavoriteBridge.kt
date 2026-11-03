package me.meeshy.sdk.model

import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.model.sticker.StickerUsageEntry

/**
 * La décoration d'un MESSAGE vue depuis la palette — miroir de `MessageStickerFavorite` (iOS). `MessageSticker` dit ce
 * qui a été ENVOYÉ, `StickerUsageEntry` ce que la palette RETIENT. La règle qui compte est la PRIORITÉ : un Mee d'abord,
 * puis le gabarit (qui porte AUSSI un emoji de repli, donc lire l'emoji en premier épinglerait « 📍 » là où l'auteur a
 * envoyé une carte postale), puis l'emoji. `null` : rien à épingler, l'entrée de menu est ABSENTE (pas grisée).
 */
object StickerFavoriteBridge {

    fun entry(sticker: MessageSticker?): StickerUsageEntry? {
        if (sticker == null) return null
        MeeStickerCatalog.sticker(sticker.templateId)?.let { return StickerUsageEntry.mee(it.id) }
        val templateId = sticker.templateId
        if (!templateId.isNullOrEmpty()) {
            // Seul un gabarit du CATALOGUE s'épingle : un `pack.<slug>.<clé>` ou un gabarit inconnu serait un favori
            // invisible à jamais, et son emoji de repli ne le remplace pas.
            return StickerTemplateCatalog.template(templateId)?.let { StickerUsageEntry.template(it.id) }
        }
        return sticker.emoji?.takeIf { it.isNotEmpty() }?.let { StickerUsageEntry.emoji(it) }
    }

    /** L'état à servir au menu : `null` ⇒ pas d'entrée, sinon « déjà épinglé ? ». */
    fun state(sticker: MessageSticker?, favorites: Collection<StickerUsageEntry>): Boolean? =
        entry(sticker)?.let { it in favorites }
}
