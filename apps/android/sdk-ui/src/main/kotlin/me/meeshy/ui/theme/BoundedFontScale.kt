package me.meeshy.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Le Dynamic Type d'iOS plafonne les éléments de chrome (capsules, pastilles, champ de saisie) : ils
 * grandissent avec la police du système jusqu'à un plafond, puis cessent. Une capsule de largeur
 * contrainte qui suit la police sans limite déborde ou se rogne (« Messag », #13397).
 */
public object BoundedFontScale {

    /** Plafond des éléments de chrome denses : lisible à 1,3 sans repousser leurs voisins. */
    public const val CHROME_MAX: Float = 1.15f

    /** Le facteur à appliquer à une taille en `sp` pour que l'échelle effective ne dépasse pas [max]. */
    public fun factor(fontScale: Float, max: Float): Float =
        if (fontScale <= max || fontScale <= 0f) 1f else max / fontScale
}

/** Cette taille, dont l'échelle de police du système est plafonnée à [max] (`1f` = ne grandit pas). */
@Composable
@ReadOnlyComposable
public fun TextUnit.boundedScale(max: Float = BoundedFontScale.CHROME_MAX): TextUnit {
    if (!isSp) return this
    return (value * BoundedFontScale.factor(LocalDensity.current.fontScale, max)).sp
}
