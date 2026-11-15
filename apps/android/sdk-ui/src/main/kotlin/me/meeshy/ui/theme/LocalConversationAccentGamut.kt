package me.meeshy.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import me.meeshy.sdk.model.appearance.AppearanceGamut
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.theme.displayPalette

/**
 * La gamme d'accents personnels, fournie une fois à la racine (`ConversationAccentGamutProvider`). Vide tant que le
 * catalogue embarqué n'est pas lu : toute conversation garde alors sa palette calculée, jamais un état d'erreur.
 */
public val LocalConversationAccentGamut: ProvidableCompositionLocal<AppearanceGamut> =
    compositionLocalOf { AppearanceGamut.EMPTY }

/** La palette que le lecteur VOIT pour [this], dans le schéma clair ou sombre courant (voir [displayPalette]). */
@Composable
public fun ApiConversation.displayPaletteInTheme(): DynamicColorGenerator.ColorPalette {
    val gamut = LocalConversationAccentGamut.current
    val scheme = AppearanceScheme.of(MeeshyTheme.isDark)
    return remember(this, gamut, scheme) { displayPalette(gamut, scheme) }
}
