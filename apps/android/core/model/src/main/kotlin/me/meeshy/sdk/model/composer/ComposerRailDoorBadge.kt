package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StorySlide

/** Ce que la scène porte déjà, porte par porte (iOS `ComposerRailMatter`). */
data class ComposerRailMatter(
    val texts: Int = 0,
    val media: Int = 0,
    val sounds: Int = 0,
    val stickers: Int = 0,
    val places: Int = 0,
    val hashtags: Int = 0,
    val mentions: Int = 0,
    val strokes: Int = 0,
    val hasDescription: Boolean = false,
    val hasContent: Boolean = false,
)

/**
 * Le compteur d'une porte (iOS `ComposerRailDoorBadge`) : l'auteur voit que la scène porte trois textes sans ouvrir la
 * porte. Un compte nul n'affiche RIEN — pas de « 0 » — et le fond ne se compte pas : il remplace, il ne s'ajoute pas.
 */
object ComposerRailDoorBadge {

    fun matter(
        slide: StorySlide,
        hashtags: Int,
        description: String,
        content: String,
        mentions: Int,
        hasDocumentLocation: Boolean,
    ): ComposerRailMatter {
        val effects = slide.effects
        return ComposerRailMatter(
            texts = effects.textObjects.size,
            media = effects.mediaObjects.orEmpty().size,
            sounds = effects.audioPlayerObjects.orEmpty().size,
            stickers = effects.stickerObjects.orEmpty().size,
            places = effects.locationObjects.size + if (hasDocumentLocation) 1 else 0,
            hashtags = hashtags,
            mentions = mentions,
            strokes = effects.drawingStrokes.orEmpty().size,
            hasDescription = description.isNotBlank(),
            hasContent = content.isNotBlank(),
        )
    }

    fun count(door: ComposerRailDoor, matter: ComposerRailMatter): Int? {
        val raw = when (door) {
            ComposerRailDoor.DESCRIPTION -> if (matter.hasDescription) 1 else 0
            ComposerRailDoor.CONTENT -> if (matter.hasContent) 1 else 0
            ComposerRailDoor.MEDIA -> matter.media
            ComposerRailDoor.SOUND -> matter.sounds
            ComposerRailDoor.TEXT -> matter.texts
            ComposerRailDoor.BACKGROUND -> 0
            ComposerRailDoor.DRAWING -> matter.strokes
            ComposerRailDoor.STICKER -> matter.stickers
            ComposerRailDoor.MENTION -> matter.mentions
            ComposerRailDoor.HASHTAG -> matter.hashtags
            ComposerRailDoor.PLACE -> matter.places
        }
        return raw.takeIf { it > 0 }
    }

    fun badges(doors: List<ComposerRailDoor>, matter: ComposerRailMatter): Map<ComposerRailDoor, Int> =
        buildMap { doors.forEach { door -> count(door, matter)?.let { put(door, it) } } }
}
