package me.meeshy.ui.component.composer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import java.io.File
import me.meeshy.sdk.model.MessageSticker

/**
 * Un sticker choisi, PRÊT à partir (#14334, iOS `sendStickerImage`) : son image ([file], [mimeType], [width] × [height]),
 * rendu de repli que lisent le web et tout client qui ne redessine pas, et sa recette [sticker] (`MessageSticker` — un
 * emoji, un gabarit et ses emplacements, un film de Mee, un sticker de pack), `null` pour une image sans recette (« Mes
 * stickers »). La conversation l'envoie d'un geste ; un commentaire en garde l'image.
 */
public data class ComposerStickerPick(
    val file: File,
    val mimeType: String,
    val sticker: MessageSticker?,
    val width: Int? = null,
    val height: Int? = null,
)

/**
 * La feuille de stickers du composeur universel (#14320, iOS `onRequestStickerPicker`) : l'application la fournit (la
 * feuille vit avec les stickers de la scène, qu'aucun module de conversation ne connaît). [onPick] rend le sticker prêt ;
 * sans fournisseur, la porte sticker ne s'affiche pas.
 */
public typealias ComposerStickerSheet = @Composable (onPick: (ComposerStickerPick) -> Unit, onDismiss: () -> Unit) -> Unit

public val LocalComposerStickerSheet = staticCompositionLocalOf<ComposerStickerSheet?> { null }
