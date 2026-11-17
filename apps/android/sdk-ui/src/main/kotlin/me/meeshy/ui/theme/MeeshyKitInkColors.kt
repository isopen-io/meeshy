package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Les encres et plaques fixes du kit, qui ne suivent pas le thème : la plaque de la carte de code (K31), toujours claire pour
 * qu'un lecteur de QR lise la carte de verre comme une feuille de papier, et l'encre sombre du billet (K30). Définies ici, avec
 * les autres jetons, et jamais en littéral dans le kit. Jumelles des teintes de `MeeshyCodeCardRecipe` et `MeeshyTicketRecipe` (iOS).
 */
object MeeshyKitInkColors {
    val GlassPlate: Color = Color(0xFFF5F3FF)
    val GlassInk: Color = Color(0xFF1B1140)
    val TicketDarkInk: Color = Color(0xFF0B0B12)
}
