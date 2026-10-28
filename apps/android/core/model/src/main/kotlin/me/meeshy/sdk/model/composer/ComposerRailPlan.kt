package me.meeshy.sdk.model.composer

/** Ce que la porte vise : la publication entière, une slide, un objet de la scène, ou la scène elle-même. */
enum class ComposerRailLevel {
    PUBLICATION, SLIDE, OBJECT, SCENE;

    /** Ce que la porte fait naître se VOIT-il sur la scène ? C'est cette question seule qui range la porte à gauche. */
    val appearsOnCanvas: Boolean get() = this == OBJECT || this == SCENE
}

/**
 * Where a door stands on the plateau (iOS `ComposerSceneFloatingRail.sideRow` / `lowRow`): the LEADING column for what
 * appears on the canvas, the CANONICAL line at the bottom for what belongs to the publication or the slide. The
 * trailing column is not a door side: it carries the object controllers, the history and a new slide.
 */
enum class ComposerRailSide { LEADING, CANONICAL }

/**
 * Les portes du plateau (iOS `ComposerRailDoor`). Le niveau décide du côté : à GAUCHE ce qu'on POSE sur
 * la scène, sur la LIGNE CANONIQUE du bas ce qui appartient à l'envoi ou à la slide — jamais sur la scène
 * (apps/ios/CLAUDE.md §§ 1-2).
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

/** The publication settings that are not doors of matter. */
enum class PublicationControl { AUDIENCE, LANGUAGE }

/**
 * Where a publication setting is painted (iOS `MeeshyComposerHost+Socle`, `+Pickers`, `ComposerMoodSurface`): the
 * audience in the SOCLE beside Publish — except the mood, whose surface carries its own audience ribbon — and the
 * language at the FOOT of the text it qualifies, never on a rail.
 */
enum class PublicationControlPlace { SOCLE, CONTENT_FOOT, SURFACE }

/**
 * iOS `ComposerSceneFloatingRail`: [leading] is the side row (what appears on the canvas), [canonical] the low row (what
 * belongs to the publication or the slide) — a partition of the offered doors, minus the post body whose door the socle
 * carries ([servesPostText]).
 */
data class ComposerRailPlan(
    val leading: List<ComposerRailDoor>,
    val canonical: List<ComposerRailDoor>,
    val servesPostText: Boolean,
) {
    val all: List<ComposerRailDoor> get() = leading + canonical

    companion object {
        /** The door the socle carries instead of the low row (iOS `ComposerSceneFloatingRail.socleDoor`). */
        val socleDoor: ComposerRailDoor = ComposerRailDoor.CONTENT

        fun side(door: ComposerRailDoor, format: ComposerFormat): ComposerRailSide =
            if (door.level(format).appearsOnCanvas) ComposerRailSide.LEADING else ComposerRailSide.CANONICAL

        /**
         * Port de `ComposerRailDoor.offered` : une porte servie, non retirée du format, et — sans toile (mood) —
         * jamais une porte de ce qui apparaît sur la toile. Le descriptif de slide n'est pas dans le rail canonique :
         * le volet sous la scène est son unique chemin.
         */
        fun of(format: ComposerFormat, served: Set<ComposerRailDoor>): ComposerRailPlan {
            val offered = ComposerRailDoor.canonicalRail.filter { door ->
                door in served && door !in removedFrom(format) &&
                    (format != ComposerFormat.STATUS || (!door.level(format).appearsOnCanvas && door !in removedFromStatus))
            }
            return ComposerRailPlan(
                leading = offered.filter { side(it, format) == ComposerRailSide.LEADING },
                canonical = offered.filter { side(it, format) == ComposerRailSide.CANONICAL && it != socleDoor },
                servesPostText = socleDoor in offered,
            )
        }

        fun publicationControls(format: ComposerFormat): Map<PublicationControl, PublicationControlPlace> = when (format) {
            ComposerFormat.STATUS -> mapOf(PublicationControl.AUDIENCE to PublicationControlPlace.SURFACE)
            else -> mapOf(
                PublicationControl.LANGUAGE to PublicationControlPlace.CONTENT_FOOT,
                PublicationControl.AUDIENCE to PublicationControlPlace.SOCLE,
            )
        }

        private fun removedFrom(format: ComposerFormat): Set<ComposerRailDoor> = buildSet {
            if (format == ComposerFormat.STORY) add(ComposerRailDoor.DESCRIPTION)
            if (format != ComposerFormat.POST) add(ComposerRailDoor.CONTENT)
        }

        private val removedFromStatus = setOf(ComposerRailDoor.PLACE, ComposerRailDoor.TEXT)
    }
}
