package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog

/**
 * **Le texte d'un sticker, pour que son image le porte** (miroir de `StickerAltText`, iOS, #6377). Un sticker part comme
 * une image : sans ce texte, un lecteur d'écran annonce « image » et la recherche ne le retrouve pas.
 *
 * Ordre : titre du sticker de Mee/Meo, sinon les valeurs des emplacements DANS L'ORDRE DU GABARIT (jamais celui d'un
 * dictionnaire), sinon l'emoji. `null`, jamais `""` : une chaîne vide annonce une description qui n'existe pas.
 */
object StickerAltText {

    fun describe(sticker: MessageSticker): String? {
        MeeStickerCatalog.sticker(sticker.templateId)?.let { return it.title }
        val values = orderedValues(sticker)
        if (values.isNotEmpty()) return values.joinToString(" ")
        return sticker.emoji?.trim()?.takeIf { it.isNotEmpty() }
    }

    /** Gabarit inconnu de ce binaire (publié par une version plus récente) : clés triées — arbitraire mais STABLE. */
    private fun orderedValues(sticker: MessageSticker): List<String> {
        val id = sticker.templateId?.takeIf { it.isNotEmpty() } ?: return emptyList()
        val template = StickerTemplateCatalog.template(id)
        val keys = template?.slots?.map { it.name } ?: sticker.slots.keys.sorted()
        return keys.mapNotNull { key -> sticker.slots[key]?.trim()?.takeIf { it.isNotEmpty() } }
    }
}
