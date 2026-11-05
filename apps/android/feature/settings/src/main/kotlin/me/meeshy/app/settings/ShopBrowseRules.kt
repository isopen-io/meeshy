package me.meeshy.app.settings

import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.ShopPack

/** Ce que la boutique montre par-dessus sa liste : la fiche d'un pack, ou un élément en plein écran. */
sealed interface ShopBrowseRoute {
    val domain: AppearancePackDomain
    val slug: String

    data class Detail(override val domain: AppearancePackDomain, override val slug: String) : ShopBrowseRoute

    data class Viewer(override val domain: AppearancePackDomain, override val slug: String, val index: Int) : ShopBrowseRoute
}

/**
 * La pile de ce qui recouvre la boutique. Vide = la boutique, à la position de défilement où on l'a laissée (elle reste
 * composée dessous). Le plein écran ouvert depuis la fiche revient à la fiche ; ouvert depuis une rangée, à la boutique.
 */
data class ShopBrowseStack(val routes: List<ShopBrowseRoute> = emptyList()) {
    val top: ShopBrowseRoute? get() = routes.lastOrNull()
    val isOpen: Boolean get() = routes.isNotEmpty()

    fun push(route: ShopBrowseRoute): ShopBrowseStack = if (top == route) this else copy(routes = routes + route)

    /** Un autre élément ouvert depuis le plein écran (« Autres propositions ») le REMPLACE : un retour ramène derrière lui. */
    fun replaceTop(route: ShopBrowseRoute): ShopBrowseStack = copy(routes = routes.dropLast(1) + route)

    fun pop(): ShopBrowseStack = copy(routes = routes.dropLast(1))
}

/**
 * Le zoom du plein écran : de ×1 à ×4 au pincement, le double toucher bascule entre l'ajustement et ×2, le décalage reste
 * dans l'image agrandie. Le glissement de page n'est rendu au pager qu'à ×1 : zoomé, le doigt déplace l'image.
 */
data class ShopItemZoom(val scale: Float = MIN, val offsetX: Float = 0f, val offsetY: Float = 0f) {

    val pagerScrolls: Boolean get() = scale <= MIN + EPSILON

    fun pinched(factor: Float, panX: Float, panY: Float, width: Float, height: Float): ShopItemZoom {
        val next = (scale * factor).coerceIn(MIN, MAX)
        return bounded(next, offsetX + panX, offsetY + panY, width, height)
    }

    fun doubleTapped(): ShopItemZoom = if (pagerScrolls) ShopItemZoom(DOUBLE_TAP) else ShopItemZoom()

    private fun bounded(next: Float, x: Float, y: Float, width: Float, height: Float): ShopItemZoom {
        val reachX = (next - 1f) * width / 2f
        val reachY = (next - 1f) * height / 2f
        return ShopItemZoom(next, x.coerceIn(-reachX, reachX), y.coerceIn(-reachY, reachY))
    }

    companion object {
        const val MIN = 1f
        const val MAX = 4f
        const val DOUBLE_TAP = 2f
        private const val EPSILON = 0.01f
    }
}

/** Glisser vers le bas au-delà de ce seuil (part de la hauteur) referme le plein écran. */
object ShopViewerDismiss {
    const val THRESHOLD = 0.18f

    fun shouldDismiss(dragY: Float, height: Float): Boolean = height > 0f && dragY / height >= THRESHOLD
}

/** Ce que le bouton du plein écran propose pour un élément. */
sealed interface ShopEquipOffer {
    data object Equip : ShopEquipOffer
    data object Equipped : ShopEquipOffer

    /** Le pack est à moi mais pas installé : on l'installe d'abord. */
    data object InstallFirst : ShopEquipOffer

    /** Un fond se choisit par conversation : la boutique ne l'impose à aucune. */
    data object PerConversation : ShopEquipOffer

    /** Pas peignable, pas à moi ou verrouillé : rien à équiper. */
    data object Unavailable : ShopEquipOffer
}

/** L'état d'un pack sur la fiche. */
enum class ShopPackState { INSTALLED, EMBEDDED, TO_DOWNLOAD }

object ShopBrowseRules {

    /** Installé d'abord ; sinon livré avec l'application (rien à télécharger) ; sinon à télécharger. */
    fun packState(pack: ShopPack, contents: ShopPackContents?): ShopPackState = when {
        pack.installed -> ShopPackState.INSTALLED
        pack.builtin || (contents as? ShopPackContents.Ready)?.embedded == true -> ShopPackState.EMBEDDED
        else -> ShopPackState.TO_DOWNLOAD
    }

    /** Le côté du décor de profil qu'un domaine équipe ; `null` pour les fonds de conversation. */
    fun side(domain: AppearancePackDomain): ProfileDecorSide? = when (domain) {
        AppearancePackDomain.AVATAR_RING -> ProfileDecorSide.AVATAR_RING
        AppearancePackDomain.BANNER -> ProfileDecorSide.BANNER
        AppearancePackDomain.BANNER_FRAME -> ProfileDecorSide.BANNER_FRAME
        AppearancePackDomain.WALLPAPER -> null
    }

    fun isEquipped(item: ShopItem, decor: ServedProfileDecor): Boolean {
        val side = side(item.domain) ?: return false
        return decor[side]?.let { it.pack == item.pack && it.item == item.key } == true
    }

    fun offer(item: ShopItem, pack: ShopPack?, decor: ServedProfileDecor): ShopEquipOffer = when {
        side(item.domain) == null -> ShopEquipOffer.PerConversation
        isEquipped(item, decor) -> ShopEquipOffer.Equipped
        item.art == null || pack == null || pack.needsPurchase || pack.isLocked -> ShopEquipOffer.Unavailable
        pack.installed || pack.builtin -> ShopEquipOffer.Equip
        pack.canToggleInstall -> ShopEquipOffer.InstallFirst
        else -> ShopEquipOffer.Unavailable
    }

    /** L'index demandé ramené dans le pack ; un pack vide reste à 0. */
    fun clampedIndex(index: Int, count: Int): Int = if (count <= 0) 0 else index.coerceIn(0, count - 1)

    /** « 2 / 5 » : la position lue à partir de 1. */
    fun position(index: Int, count: Int): Pair<Int, Int> = (clampedIndex(index, count) + 1) to count.coerceAtLeast(0)

    /**
     * Les éléments des AUTRES packs du même domaine, dans l'ordre de la boutique, un pack pas encore peignable ne
     * proposant rien. [limit] borne la rangée.
     */
    fun otherProposals(
        packs: List<ShopPack>,
        current: String,
        contents: Map<String, ShopPackContents>,
        limit: Int = OTHER_PROPOSALS,
    ): List<ShopItem> = packs.asSequence()
        .filter { it.slug != current }
        .flatMap { (contents[it.slug] as? ShopPackContents.Ready)?.items.orEmpty().asSequence() }
        .take(limit)
        .toList()

    const val OTHER_PROPOSALS = 12
}
