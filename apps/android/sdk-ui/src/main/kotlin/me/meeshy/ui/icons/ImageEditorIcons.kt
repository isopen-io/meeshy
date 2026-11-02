package me.meeshy.ui.icons

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.RotateLeft as AfRotateLeft
import androidx.compose.material.icons.automirrored.filled.RotateRight as AfRotateRight
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Les deux glyphes de pivot propres à l'éditeur d'image (le recadrage iOS : `rotate.left` /
 * `rotate.right`), hors de la table des rôles partagés de [MeeshyIcons].
 */
internal object ImageEditorIcons {
    val RotateLeft: ImageVector get() = Icons.AutoMirrored.Filled.AfRotateLeft
    val RotateRight: ImageVector get() = Icons.AutoMirrored.Filled.AfRotateRight
}
