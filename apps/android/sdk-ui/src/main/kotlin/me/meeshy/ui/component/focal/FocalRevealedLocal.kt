package me.meeshy.ui.component.focal

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf

/**
 * La clé de révélation PARTAGÉE du message (iOS `focalMessageRevealed`) : vraie tant que l'enveloppe de protection
 * du bloc contenu est levée. Les cases de la grille la lisent pour lever leur propre flou en même temps que le
 * message — sans jamais lever une vue unique — et la reprennent quand l'enveloppe se referme : aucune case n'est
 * re-voilée ni dévoilée à contretemps parce qu'un parent a recomposé.
 */
public val LocalFocalMessageRevealed: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }
