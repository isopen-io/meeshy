package me.meeshy.ui.component.settings

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Constantes de la trame des réglages (miroir de `SettingsRowMetrics` iOS) et ce qu'on en dérive. */
public object SettingsRowMetrics {
    public val iconSize: Dp = 34.dp
    public val iconTextSpacing: Dp = 14.dp
    public val horizontalPadding: Dp = 16.dp
    public val verticalPadding: Dp = 15.dp
    public val minimumHeight: Dp = 48.dp

    /** Retrait du filet : aligné sur le titre, pas sur le bord de la carte. */
    public val separatorInset: Dp = horizontalPadding + iconSize + iconTextSpacing

    /** Opacité de la tuile d'icône (12 %). */
    public const val ICON_TILE_ALPHA: Float = 0.12f

    /** « Titre, valeur » ; la valeur vide est omise (pas de virgule orpheline). */
    public fun accessibilityLabel(title: String, value: String?): String =
        if (value.isNullOrBlank()) title else "$title, $value"
}
