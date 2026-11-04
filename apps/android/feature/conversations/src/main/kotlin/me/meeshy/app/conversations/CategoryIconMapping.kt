package me.meeshy.app.conversations

import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le glyphe d'une catégorie : son icône propre (nom de symbole iOS ou Material, tel que le
 * serveur le stocke) sinon le dossier. Un nom inconnu retombe sur le dossier, jamais sur rien.
 */
internal fun categoryIconFor(name: String?): ImageVector = when (name?.trim()?.lowercase()) {
    "briefcase", "work", "briefcase.fill" -> MeeshyIcons.Work
    "house", "home", "house.fill" -> MeeshyIcons.Home
    "star", "star.fill" -> MeeshyIcons.StarFilled
    "heart", "favorite", "heart.fill" -> MeeshyIcons.HeartFilled
    "graduationcap", "school", "graduationcap.fill" -> MeeshyIcons.School
    "cart", "shopping", "cart.fill" -> MeeshyIcons.ShoppingCart
    "person.2", "group", "people", "person.2.fill" -> MeeshyIcons.GroupFilled
    "airplane", "flight", "travel" -> MeeshyIcons.Flight
    "music.note", "music" -> MeeshyIcons.MusicNote
    "pin", "pin.fill" -> MeeshyIcons.PinFilled
    "bubble.left", "chat" -> MeeshyIcons.Chat
    else -> MeeshyIcons.FolderFilled
}
