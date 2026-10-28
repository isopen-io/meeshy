package me.meeshy.sdk.model.composer

/** Ce que la porte vise : la publication entière, une slide, un objet de la scène, ou la scène elle-même. */
enum class ComposerRailLevel {
    PUBLICATION, SLIDE, OBJECT, SCENE;

    /** Ce que la porte fait naître se VOIT-il sur la scène ? C'est cette question seule qui range la porte à gauche. */
    val appearsOnCanvas: Boolean get() = this == OBJECT || this == SCENE
}

enum class ComposerRailSide { LEADING, TRAILING }

/**
 * Les portes du plateau (iOS `ComposerRailDoor`). Le niveau décide du côté : à GAUCHE ce qu'on POSE sur
 * la scène, à DROITE ce qui structure la PUBLICATION — jamais sur la scène (apps/ios/CLAUDE.md § 1).
 */
enum class ComposerRailDoor {
    DESCRIPTION, CONTENT, MEDIA, SOUND, STICKER, MENTION, PLACE, DRAWING, TEXT, HASHTAG, BACKGROUND;

    fun level(format: ComposerFormat): ComposerRailLevel = when (this) {
        DESCRIPTION -> ComposerRailLevel.SLIDE
        CONTENT -> ComposerRailLevel.PUBLICATION
        TEXT, MEDIA, SOUND, STICKER -> ComposerRailLevel.OBJECT
        MENTION, PLACE, HASHTAG -> if (format == ComposerFormat.STORY) ComposerRailLevel.OBJECT else ComposerRailLevel.PUBLICATION
        DRAWING, BACKGROUND -> ComposerRailLevel.SCENE
    }

    companion object {
        val canonicalRail: List<ComposerRailDoor> =
            listOf(CONTENT, MEDIA, SOUND, TEXT, BACKGROUND, DRAWING, STICKER, MENTION, HASHTAG, PLACE)
    }
}

/** Les réglages de la publication qui ne sont pas des portes de matière : ils vivent sur le rail de droite. */
enum class PublicationControl { AUDIENCE, LANGUAGE }

data class ComposerRailPlan(val leading: List<ComposerRailDoor>, val trailing: List<ComposerRailDoor>) {
    val all: List<ComposerRailDoor> get() = leading + trailing

    companion object {
        fun side(door: ComposerRailDoor, format: ComposerFormat): ComposerRailSide =
            if (door.level(format).appearsOnCanvas) ComposerRailSide.LEADING else ComposerRailSide.TRAILING

        /**
         * Port de `ComposerRailDoor.offered` : une porte servie, non retirée du format, et — sans toile (mood) —
         * jamais une porte de ce qui apparaît sur la toile. Le descriptif de slide n'est pas dans le rail canonique ;
         * il existe hors story.
         */
        fun of(format: ComposerFormat, served: Set<ComposerRailDoor>): ComposerRailPlan {
            val offered = (ComposerRailDoor.canonicalRail + ComposerRailDoor.DESCRIPTION).filter { door ->
                door in served && door !in removedFrom(format) &&
                    (format != ComposerFormat.STATUS || (!door.level(format).appearsOnCanvas && door !in removedFromStatus))
            }
            return ComposerRailPlan(
                leading = offered.filter { side(it, format) == ComposerRailSide.LEADING },
                trailing = offered.filter { side(it, format) == ComposerRailSide.TRAILING },
            )
        }

        fun publicationControls(format: ComposerFormat): List<PublicationControl> = when (format) {
            ComposerFormat.STATUS -> listOf(PublicationControl.AUDIENCE)
            else -> listOf(PublicationControl.LANGUAGE, PublicationControl.AUDIENCE)
        }

        private fun removedFrom(format: ComposerFormat): Set<ComposerRailDoor> = buildSet {
            if (format == ComposerFormat.STORY) add(ComposerRailDoor.DESCRIPTION)
            if (format != ComposerFormat.POST) add(ComposerRailDoor.CONTENT)
        }

        private val removedFromStatus = setOf(ComposerRailDoor.PLACE, ComposerRailDoor.TEXT)
    }
}
