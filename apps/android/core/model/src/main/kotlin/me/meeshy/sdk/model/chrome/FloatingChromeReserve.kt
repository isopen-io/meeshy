package me.meeshy.sdk.model.chrome

/**
 * La zone que les disques flottants prennent EN BAS de l'écran (le plus HAUT des disques posés dans la moitié basse fixe la marge, de son sommet au bas de l'écran), à réserver comme marge de fin de
 * contenu : le dernier élément d'une liste ou d'un écran défile jusqu'au-dessus des disques au lieu
 * de s'arrêter dessous (recette S8 : un compteur de section, un interrupteur ou un avatar passaient
 * sous un disque, et le toucher partait au disque).
 *
 * Un disque posé dans la moitié haute de l'écran ne se réserve pas : une marge d'un demi-écran
 * ferait plus de mal que le recouvrement qu'elle évite (la loi de défilement les efface déjà
 * pendant le geste).
 */
public object FloatingChromeReserve {

    /** Air laissé entre le haut du disque le plus bas et la fin du contenu, en dp. */
    public const val CLEARANCE: Float = 8f

    public fun bottomDp(layout: FloatingButtonsLayout, screenHeight: Float): Float {
        if (screenHeight <= 0f) return 0f
        val half = FloatingButtonGeometry.BUTTON_SIZE / 2f
        return listOf(layout.feed, layout.menu)
            .filter { it.y > screenHeight / 2f }
            .maxOfOrNull { screenHeight - (it.y - half) + CLEARANCE }
            ?.coerceAtLeast(0f)
            ?: 0f
    }
}
