package me.meeshy.sdk.model.sticker

/** Les 100 Instants de Mee et Meo, GÉNÉRÉS (`MeeInstantCatalogData`) depuis l'index mesuré sur le web. */
object MeeInstantCatalog {
    /** La boîte de vue du dessin (`MEE_VIEWBOX`), dans le repère où l'index mesure. */
    data class ViewBox(val x: Float, val y: Float, val width: Float, val height: Float)

    data class Section(val kind: MeeInstantKind, val instants: List<MeeInstant>)

    val viewBox: ViewBox = ViewBox(
        MeeInstantCatalogData.VIEW_BOX_X,
        MeeInstantCatalogData.VIEW_BOX_Y,
        MeeInstantCatalogData.VIEW_BOX_WIDTH,
        MeeInstantCatalogData.VIEW_BOX_HEIGHT,
    )

    val all: List<MeeInstant> get() = MeeInstantCatalogData.ALL

    private val byId: Map<String, MeeInstant> by lazy { all.associateBy { it.id } }

    /** Messages, Moments, Lieux, Météo — dans cet ordre, aucune famille vide. */
    val sections: List<Section> by lazy {
        MeeInstantKind.entries.mapNotNull { kind ->
            all.filter { it.kind == kind }.takeIf { it.isNotEmpty() }?.let { Section(kind, it) }
        }
    }

    fun instant(forTemplateId: String?): MeeInstant? {
        if (forTemplateId == null || !forTemplateId.startsWith(MeeStickerCatalog.TEMPLATE_PREFIX)) return null
        return byId[forTemplateId.removePrefix(MeeStickerCatalog.TEMPLATE_PREFIX)]
    }
}
