package me.meeshy.sdk.model.sticker

/**
 * Les gabarits livrés avec Android — les 200 identifiants, replis, échelles de pose et mouvements de
 * `StickerTemplateCatalog` (iOS), vingt familles de dix, dans l'ordre de la palette. Constante du binaire : un
 * identifiant inconnu (gabarit d'une version plus récente) rend `null` et le lecteur sert l'emoji de repli — jamais un
 * gabarit fabriqué. Savoir qu'un gabarit EXISTE n'est pas savoir le DESSINER : le dessin vit dans `:sdk-ui`.
 */
object StickerTemplateCatalog {

    val all: List<StickerTemplate> = StickerTemplateFamily.entries.flatMap { StickerTemplateFamilyTable.templates(it) }

    val text: List<StickerTemplate> = templates(StickerTemplateFamily.TEXT)

    val time: List<StickerTemplate> = templates(StickerTemplateFamily.TIME)

    private val byId: Map<String, StickerTemplate> = all.associateBy { it.id }

    private val indexById: Map<String, Int> = all.withIndex().associate { (index, template) -> template.id to index }

    fun template(id: String): StickerTemplate? = byId[id]

    fun templates(family: StickerTemplateFamily): List<StickerTemplate> = StickerTemplateFamilyTable.templates(family)

    fun fallbackEmoji(id: String): String? = byId[id]?.fallbackEmoji

    /** La position du gabarit dans la palette, ou `null` s'il est inconnu. */
    fun index(id: String): Int? = indexById[id]

    /** Les cadres qui portent les MOTS de l'auteur : ceux de la famille texte qui ont un emplacement de prose. */
    val wordFrames: List<StickerTemplate> = text.filter { it.takesProse }

    /**
     * Les gabarits que le Compose historique (`StickerTemplateArtwork`) dessine encore : les dix cadres à mots et les
     * quatre premières décorations d'heure. Tout autre est dessiné par le registre de `:sdk-ui`, ou retombe sur son emoji.
     */
    val composeDrawnIds: Set<String> = (
        text.map { it.id } + listOf("time.digital", "time.analog", "time.ribbon", "time.calendarDay")
        ).toSet()
}
