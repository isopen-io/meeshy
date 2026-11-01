package me.meeshy.ui.component.composer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * La feuille de stickers du composeur universel (#14320, iOS `onRequestStickerPicker`) : l'application la fournit (la
 * feuille vit avec les stickers de la scène, qu'aucun module de conversation ne connaît). [onPick] rend le glyphe choisi ;
 * sans fournisseur, la porte sticker ne s'affiche pas.
 */
public typealias ComposerStickerSheet = @Composable (onPick: (String) -> Unit, onDismiss: () -> Unit) -> Unit

public val LocalComposerStickerSheet = staticCompositionLocalOf<ComposerStickerSheet?> { null }
