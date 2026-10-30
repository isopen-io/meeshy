package me.meeshy.sdk.model.call.frames

/**
 * Une DÉCLINAISON d'un cadre (#12685, miroir de iOS `CallFrameStyle`) : même motif, même disposition par
 * tranche, autre habillage — par exemple sa version « Relief ». [look] est l'apparence déjà composée : celle
 * du cadre, dont seules les clés que la déclinaison déclare ont été remplacées.
 */
public data class CallFrameStyle(val id: String, val name: String, val look: CallFrameLook)

/**
 * **LES DÉCLINAISONS D'UN CADRE** (#12685), en fonctions pures — miroir de iOS `CallFrameStyleRule`. Une
 * déclinaison a pour identifiant celui du cadre suivi du sien (`ambiance.motif.tranche.style`, quatre parties :
 * la forme que la passerelle accepte déjà) ; un client qui ne la connaît pas retombe sur rien, jamais sur un autre.
 */
public object CallFrameStyleRule {
    private const val STYLED_PARTS = 4

    /** Le cadre [design] sous la déclinaison [style]. */
    public fun styled(design: CallFrameDesign, style: CallFrameStyle): CallFrameDesign =
        design.copy(id = "${design.id}.${style.id}", look = style.look, styleId = style.id)

    /** Un identifiant du catalogue, de base ou décliné. */
    public fun resolve(id: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? {
        among.firstOrNull { it.id == id }?.let { return it }
        val parts = id.split('.')
        if (parts.size != STYLED_PARTS) return null
        val base = among.firstOrNull { it.id == parts.take(STYLED_PARTS - 1).joinToString(".") } ?: return null
        return base.styles.firstOrNull { it.id == parts.last() }?.let { styled(base, it) }
    }

    /** L'identifiant du cadre de base d'un identifiant, décliné ou non. */
    public fun baseId(id: String): String {
        val parts = id.split('.')
        return if (parts.size == STYLED_PARTS) parts.take(STYLED_PARTS - 1).joinToString(".") else id
    }

    /** Le cadre de base puis chacune de ses déclinaisons, dans l'ordre du motif. */
    public fun declinations(baseId: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameDesign> {
        val base = among.firstOrNull { it.id == baseId } ?: return emptyList()
        return listOf(base) + base.styles.map { styled(base, it) }
    }

    /** La déclinaison voisine ([offset] = ±1) d'un cadre, sans boucler ; `null` au bord. */
    public fun neighbour(id: String, offset: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? {
        val list = declinations(baseId(id), among)
        val index = list.indexOfFirst { it.id == id }
        if (index < 0) return null
        return list.getOrNull(index + offset)
    }

    /** L'identifiant d'une déclinaison : une partie de l'alphabet de la passerelle. */
    public fun isStyleId(value: String): Boolean =
        value.isNotEmpty() && value.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }
}
