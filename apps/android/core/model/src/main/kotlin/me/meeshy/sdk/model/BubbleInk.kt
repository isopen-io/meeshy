package me.meeshy.sdk.model

import me.meeshy.sdk.model.theme.HexColor
import me.meeshy.sdk.model.theme.InkColor

/**
 * L'encre d'une bulle : noir ou blanc, élue par contraste WCAG sur le fond (miroir de
 * `BubbleInk` iOS, qui délègue à `Color.readableInk`). Tout ce qui s'écrit SUR la bulle
 * envoyée — texte, méta, liens, citation, pièces — lit cette encre, jamais un blanc en dur.
 */
enum class BubbleInk {
    BLACK, WHITE;

    companion object {
        /** Encre lisible sur [hex] ; un hex illisible retombe sur le blanc (fond de marque). */
        fun readableOn(hex: String): BubbleInk =
            when (HexColor.parse(hex)?.readableInk) {
                InkColor.BLACK -> BLACK
                InkColor.WHITE, null -> WHITE
            }
    }
}
