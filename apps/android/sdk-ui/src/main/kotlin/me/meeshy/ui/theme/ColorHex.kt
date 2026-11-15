package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.theme.HexColor
import me.meeshy.sdk.model.theme.InkColor

/**
 * Convertit une chaîne hexadécimale Meeshy (`RRGGBB`, `#RRGGBB`, `RRGGBBAA` alpha en dernier, `#RGB`)
 * en [Color] Compose, par l'analyseur UNIQUE [HexColor.parse]. Une entrée illisible rend
 * [Color.Unspecified] (documenté : l'appelant choisit son repli avec `takeOrElse`).
 */
public fun hexColor(hex: String): Color = HexColor.parse(hex)?.toColor() ?: Color.Unspecified

public fun HexColor.toColor(): Color = Color(red = red, green = green, blue = blue, alpha = alpha)

/** Encre (noir ou blanc) la plus lisible sur [hex] ; blanc si [hex] est illisible. */
public fun readableInk(hex: String): Color =
    when (HexColor.parse(hex)?.readableInk) {
        InkColor.BLACK -> Color.Black
        else -> Color.White
    }

/** Comme [hexColor], avec [fallback] pour une entrée illisible. */
public fun hexColor(hex: String, fallback: Color): Color = HexColor.parse(hex)?.toColor() ?: fallback
