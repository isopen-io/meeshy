package me.meeshy.ui.component.game

/**
 * Le corps du chiffre du niveau selon son nombre de chiffres (les niveaux s'ouvrent au-delà de 100) : il tient
 * dans le disque de 1 à 5 chiffres, en unités de la boîte de 56 de l'anneau. Miroir de `levelTypeSize(forLevel:)`
 * (iOS) et de `levelFontSize` (`level-ring.tsx`).
 */
public fun levelTypeSize(forLevel: Int): Float = when (maxOf(0, forLevel).toString().length) {
    1, 2 -> 14f
    3 -> 11f
    4 -> 9f
    else -> 7.5f
}
