package me.meeshy.app.conversations

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Work
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Le glyphe d'une catégorie : son icône propre (nom de symbole iOS ou Material, tel que le
 * serveur le stocke) sinon le dossier. Un nom inconnu retombe sur le dossier, jamais sur rien.
 */
internal fun categoryIconFor(name: String?): ImageVector = when (name?.trim()?.lowercase()) {
    "briefcase", "work", "briefcase.fill" -> Icons.Filled.Work
    "house", "home", "house.fill" -> Icons.Filled.Home
    "star", "star.fill" -> Icons.Filled.Star
    "heart", "favorite", "heart.fill" -> Icons.Filled.Favorite
    "graduationcap", "school", "graduationcap.fill" -> Icons.Filled.School
    "cart", "shopping", "cart.fill" -> Icons.Filled.ShoppingCart
    "person.2", "group", "people", "person.2.fill" -> Icons.Filled.Group
    "airplane", "flight", "travel" -> Icons.Filled.Flight
    "music.note", "music" -> Icons.Filled.MusicNote
    "pin", "pin.fill" -> Icons.Filled.PushPin
    "bubble.left", "chat" -> Icons.AutoMirrored.Filled.Chat
    else -> Icons.Filled.Folder
}
